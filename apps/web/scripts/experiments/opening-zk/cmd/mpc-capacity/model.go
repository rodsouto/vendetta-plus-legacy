// Linux-only bounded capacity experiment. It does not compile game circuits,
// persist SRS/keys or establish ceremony provenance.
package main

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unsafe"

	curve "github.com/consensys/gnark-crypto/ecc/bn254"
	"github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	"github.com/consensys/gnark/logger"
)

const maxLog2 = 16
const addressSpaceBytes = 4 << 30
const observedRSSLimit = 512 << 20
const minHostAvailable = 2 << 30
const cpuSeconds = 90
const wallSeconds = 120
const fileBytes = 64 << 10

type Model struct {
	Circuit                      string `json:"circuit"`
	DomainSize                   uint64 `json:"domainSize"`
	OneSRSPointArraysBytes       uint64 `json:"oneSrsPointArraysBytes"`
	OneContributionBytes         uint64 `json:"oneContributionBytes"`
	SealedSRSBytes               uint64 `json:"sealedSrsBytes"`
	VerificationPointArraysBytes uint64 `json:"verificationPointArraysBytes"`
	TwoRetainedTranscriptsBytes  uint64 `json:"twoRetainedTranscriptsBytes"`
	ModeledLiveBytes             uint64 `json:"modeledLiveBytes"`
	Phase1Status                 string `json:"phase1Status"`
	Phase2Status                 string `json:"phase2Status"`
}

// Structural arrays only. The verification path holds two decoded inputs and
// its initialized predecessor. GC overlap and all arithmetic/CS/runtime overhead
// are excluded. This is not an empirical peak or a sufficient budget.
func model(circuit string, log2 int) Model {
	n := uint64(1) << log2
	g1 := uint64(unsafe.Sizeof(curve.G1Affine{}))
	g2 := uint64(unsafe.Sizeof(curve.G2Affine{}))
	arrays := (4*n-1)*g1 + (n+1)*g2
	transcript := 192*n + 265
	return Model{Circuit: circuit, DomainSize: n, OneSRSPointArraysBytes: arrays, OneContributionBytes: transcript, SealedSRSBytes: 192*n - 56,
		VerificationPointArraysBytes: 3 * arrays, TwoRetainedTranscriptsBytes: 2 * transcript, ModeledLiveBytes: 3*arrays + 2*transcript,
		Phase1Status: "not-run", Phase2Status: "not-measured-requires-budgeted-game-cs"}
}
func targets() []Model {
	out := []Model{model("invalid-point", 22), model("opening", 23)}
	for i := range out {
		if out[i].ModeledLiveBytes > addressSpaceBytes || out[i].VerificationPointArraysBytes > observedRSSLimit {
			out[i].Phase1Status = "not-run-exceeds-experiment-budget"
		}
	}
	return out
}
func domains(maximum int) ([]int, error) {
	if maximum < 3 || maximum > maxLog2 {
		return nil, errors.New("capacity sweep accepts only log2 3..16; full game domains are forbidden")
	}
	var out []int
	for _, n := range []int{10, 12, 14, 16} {
		if n <= maximum {
			out = append(out, n)
		}
	}
	if len(out) == 0 || out[len(out)-1] != maximum {
		out = append(out, maximum)
	}
	return out, nil
}
func memoryField(path, name string) (uint64, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer f.Close()
	scanner := bufio.NewScanner(io.LimitReader(f, 64<<10))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) != 3 || fields[0] != name+":" {
			continue
		}
		n, err := strconv.ParseUint(fields[1], 10, 64)
		if err != nil || fields[2] != "kB" {
			return 0, errors.New("invalid kernel memory field")
		}
		return n * 1024, nil
	}
	if err := scanner.Err(); err != nil {
		return 0, err
	}
	return 0, fmt.Errorf("missing kernel field %s", name)
}

// processRSS distinguishes a disappearing/zombie worker from a live worker
// whose memory cannot be observed. The supervisor stops the latter.
func processRSS(pid int) (uint64, bool, error) {
	path := fmt.Sprintf("/proc/%d/status", pid)
	raw, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return 0, true, nil
	}
	if err != nil {
		return 0, false, err
	}
	return parseProcessRSS(raw)
}
func parseProcessRSS(raw []byte) (uint64, bool, error) {
	if len(raw) > 64<<10 {
		return 0, false, errors.New("oversized process status")
	}
	for _, line := range strings.Split(string(raw), "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 2 && fields[0] == "State:" && (fields[1] == "Z" || fields[1] == "X") {
			return 0, true, nil
		}
	}
	scanner := bufio.NewScanner(bytes.NewReader(raw))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) == 3 && fields[0] == "VmRSS:" && fields[2] == "kB" {
			n, err := strconv.ParseUint(fields[1], 10, 64)
			if err != nil {
				return 0, false, err
			}
			return n * 1024, false, nil
		}
	}
	return 0, false, errors.New("cannot observe live worker RSS")
}
func workerLimits() error {
	for resource, n := range map[int]uint64{syscall.RLIMIT_AS: addressSpaceBytes, syscall.RLIMIT_CPU: cpuSeconds, syscall.RLIMIT_FSIZE: fileBytes, syscall.RLIMIT_CORE: 0} {
		if err := syscall.Setrlimit(resource, &syscall.Rlimit{Cur: n, Max: n}); err != nil {
			return err
		}
	}
	return nil
}

type Checkpoint struct {
	Operation          string `json:"operation"`
	DomainSize         uint64 `json:"domainSize"`
	WallMilliseconds   int64  `json:"wallMilliseconds"`
	CurrentRSSBytes    uint64 `json:"currentRssBytes"`
	ProcessMaxRSSBytes int64  `json:"processMaxRssBytes"`
	ArtifactBytes      int64  `json:"artifactBytes"`
	ArtifactSHA256     string `json:"artifactSha256"`
}

func encodeNative(v io.WriterTo) ([]byte, error) {
	var b bytes.Buffer
	_, err := v.WriteTo(&b)
	return b.Bytes(), err
}
func digest(raw []byte) string { hash := sha256.Sum256(raw); return hex.EncodeToString(hash[:]) }
func nativeRead(data []byte, n uint64) (*mpcsetup.Phase1, error) {
	// Only internally generated bytes are read here, never files or user input.
	// Size and N are still checked before entering the allocating native reader.
	if n < 8 || n > 1<<maxLog2 || len(data) != int(192*n+265) || binary.BigEndian.Uint64(data[288:296]) != n {
		return nil, errors.New("generated native size mismatch")
	}
	p := new(mpcsetup.Phase1)
	consumed, err := p.ReadFrom(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	if consumed != int64(len(data)) {
		return nil, errors.New("incomplete generated transcript read")
	}
	return p, nil
}
func measure(log2 int, output io.Writer) error {
	if log2 < 3 || log2 > maxLog2 {
		return errors.New("capacity worker rejects full game domains")
	}
	logger.Disable()
	n := uint64(1) << log2
	emit := func(op string, started time.Time, size int64, hash string) error {
		rss, err := memoryField("/proc/self/status", "VmRSS")
		if err != nil {
			return err
		}
		var usage syscall.Rusage
		if err := syscall.Getrusage(syscall.RUSAGE_SELF, &usage); err != nil {
			return err
		}
		cp := Checkpoint{op, n, time.Since(started).Milliseconds(), rss, usage.Maxrss * 1024, size, hash}
		if err := jsonEncoder(output, cp); err != nil {
			return err
		}
		if file, ok := output.(*os.File); ok {
			return file.Sync()
		}
		return nil
	}
	start := time.Now()
	p := mpcsetup.NewPhase1(n)
	if err := emit("initialize", start, 0, ""); err != nil {
		return err
	}
	transcripts := make([][]byte, 2)
	for i := range transcripts {
		start = time.Now()
		p.Contribute()
		raw, err := encodeNative(p)
		if err != nil {
			return err
		}
		transcripts[i] = raw
		if int64(len(raw)) != int64(model("sample", log2).OneContributionBytes) {
			return errors.New("native contribution size differs from model")
		}
		if err := emit(fmt.Sprintf("contribute-%d-and-serialize", i+1), start, int64(len(raw)), digest(raw)); err != nil {
			return err
		}
	}
	p = nil
	runtime.GC()
	start = time.Now()
	list := make([]*mpcsetup.Phase1, 2)
	for i, raw := range transcripts {
		var err error
		list[i], err = nativeRead(raw, n)
		if err != nil {
			return err
		}
	}
	if err := emit("decode-two-fresh", start, 0, ""); err != nil {
		return err
	}
	start = time.Now()
	// Fixed public challenge deliberately unsafe: capacity only, no ceremony.
	commons, err := mpcsetup.VerifyPhase1(n, []byte("VENDETTA_UNSAFE_MPC_CAPACITY_ONLY_V1"), list...)
	if err != nil {
		return err
	}
	h := sha256.New()
	size, err := commons.WriteTo(h)
	if err != nil {
		return err
	}
	if uint64(size) != model("sample", log2).SealedSRSBytes {
		return errors.New("native sealed SRS size differs from model")
	}
	if err := emit("verify-seal-and-hash", start, size, hex.EncodeToString(h.Sum(nil))); err != nil {
		return err
	}
	runtime.KeepAlive(transcripts)
	return emit("complete", time.Now(), 0, "")
}

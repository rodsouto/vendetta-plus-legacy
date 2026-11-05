package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"

	"vendetta-opening-pairing-experiment/mpcinspect"
)

func continueContribution(log2 int, dir, input, pin, previousPath, previousPin string) error {
	if log2 != 3 && log2 != 22 && log2 != 23 {
		return errors.New("unsupported continuation domain")
	}
	if err := limitsFor("continue"); err != nil {
		return err
	}
	if log2 != 3 {
		mem, err := readKB("/proc/meminfo", "MemAvailable")
		if err != nil {
			return err
		}
		if mem < minAvailable {
			return errors.New("host headroom unavailable")
		}
	}
	a, err := sourceArtifact(input, pin, log2)
	if err != nil {
		return err
	}
	v, err := readPinnedVerification(previousPath, previousPin, log2)
	if err != nil {
		return err
	}
	if a.Operation != "first-contribution" || a.ParentArtifactSHA256 != "" || v.SourceArtifactSHA256 != pin || v.TranscriptSHA256 != a.SHA256 || v.PreviousVerificationSHA256 != "" {
		return errors.New("continuation requires matching verified first contribution")
	}
	if err := outside(dir); err != nil {
		return err
	}
	if err := os.Mkdir(dir, 0700); err != nil {
		return err
	}
	log, err := os.OpenFile(filepath.Join(dir, "checkpoints.jsonl"), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	defer log.Close()
	emit := func(stage string) error {
		var u syscall.Rusage
		if err := syscall.Getrusage(syscall.RUSAGE_SELF, &u); err != nil {
			return err
		}
		if err := json.NewEncoder(log).Encode(map[string]any{"stage": stage, "at": time.Now().UTC().Format(time.RFC3339), "maxRssBytes": u.Maxrss * 1024}); err != nil {
			return err
		}
		return log.Sync()
	}
	f, err := regular(filepath.Join(input, "contribution.bin"))
	if err != nil {
		return err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || info.Size() != a.Bytes {
		return errors.New("previous transcript size differs")
	}
	csPin := strings.Repeat("a", 64)
	if log2 == 22 {
		csPin = "89a9897b75e9cd785bd62feda8fc60ed50239f58e8b60211561fa560d8832898"
	} else if log2 == 23 {
		csPin = "06e4740642174a1f0f03ab0c0f06f2199b996534c30546df6896b9f3ab777b1f"
	}
	shape := mpcinspect.Shape{Schema: "vendetta-hidden-v2-native-shape-1", CircuitSHA256: csPin, Phase: 1, Domain: uint64(1) << log2, PrivateCommitted: []uint64{}}
	if err := emit("read-previous-start"); err != nil {
		return err
	}
	decoded, err := mpcinspect.Decode(f, shape, a.SHA256, fileBytes, 4<<30)
	if err != nil {
		return err
	}
	if err := emit("contribution-start"); err != nil {
		return err
	}
	p := decoded.Phase1
	p.Contribute()
	if err := emit("contribution-complete"); err != nil {
		return err
	}
	out, err := os.OpenFile(filepath.Join(dir, "contribution.bin"), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	buffer := bufio.NewWriterSize(out, 1<<20)
	h := sha256.New()
	n, err := p.WriteTo(io.MultiWriter(buffer, h))
	if err == nil {
		err = buffer.Flush()
	}
	if err == nil {
		err = out.Sync()
	}
	closeErr := out.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if err := syncDirectory(dir); err != nil {
		return err
	}
	if n != a.Bytes {
		return errors.New("second contribution wire size differs")
	}
	runtime.KeepAlive(p)
	if err := emit("persist-complete"); err != nil {
		return err
	}
	return exclusiveJSON(filepath.Join(dir, "artifact.json"), Artifact{Schema: "vendetta-unsafe-local-phase1-artifact-2", Operation: "second-contribution", Log2: log2, Bytes: n, SHA256: hex.EncodeToString(h.Sum(nil)), ParentArtifactSHA256: pin})
}

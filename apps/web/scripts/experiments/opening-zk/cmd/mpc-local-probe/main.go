// A separate, budgeted local initialization probe. No contributions or keys.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	"vendetta-opening-pairing-experiment/mpcrehearsal"
)

const addressBytes uint64 = 8 << 30
const reserveAvailable uint64 = 12 << 30
const cpuSeconds uint64 = 90
const wallSeconds = 120
const fileBytes = 64 << 10

func memory() (uint64, error) {
	b, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0, err
	}
	for _, line := range strings.Split(string(b), "\n") {
		v := strings.Fields(line)
		if len(v) == 3 && v[0] == "MemAvailable:" && v[2] == "kB" {
			n, err := strconv.ParseUint(v[1], 10, 64)
			return n * 1024, err
		}
	}
	return 0, errors.New("host available memory unavailable")
}
func limits() error {
	for key, value := range map[int]uint64{syscall.RLIMIT_AS: addressBytes, syscall.RLIMIT_CPU: cpuSeconds, syscall.RLIMIT_FSIZE: fileBytes, syscall.RLIMIT_CORE: 0} {
		if err := syscall.Setrlimit(key, &syscall.Rlimit{Cur: value, Max: value}); err != nil {
			return err
		}
		var got syscall.Rlimit
		if err := syscall.Getrlimit(key, &got); err != nil {
			return err
		}
		if got.Cur != value || got.Max != value {
			return errors.New("kernel limits differ")
		}
	}
	runtime.GOMAXPROCS(4)
	debug.SetMemoryLimit(5 << 30)
	return nil
}

type Checkpoint struct {
	Stage        string `json:"stage"`
	Log2         int    `json:"log2"`
	Milliseconds int64  `json:"milliseconds"`
	MaxRSSBytes  int64  `json:"maxRssBytes"`
	WireBytes    int64  `json:"wireBytes"`
	SHA256       string `json:"sha256"`
}

func measure(log2 int, path string) error {
	if log2 != 3 && log2 != 22 && log2 != 23 {
		return errors.New("only test domain 8 or reproduced game domains accepted")
	}
	if log2 != 3 {
		available, err := memory()
		if err != nil {
			return err
		}
		if available < reserveAvailable {
			return errors.New("host memory below local probe reserve")
		}
	}
	if err := limits(); err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL|syscall.O_NOFOLLOW, 0600)
	if err != nil {
		return err
	}
	defer f.Close()
	emit := func(stage string, start time.Time, n int64, digest string) error {
		var usage syscall.Rusage
		if err := syscall.Getrusage(syscall.RUSAGE_SELF, &usage); err != nil {
			return err
		}
		if err := json.NewEncoder(f).Encode(Checkpoint{stage, log2, time.Since(start).Milliseconds(), usage.Maxrss * 1024, n, digest}); err != nil {
			return err
		}
		return f.Sync()
	}
	start := time.Now()
	p := mpcsetup.NewPhase1(uint64(1) << log2)
	if err := emit("initialize", start, 0, ""); err != nil {
		return err
	}
	start = time.Now()
	h := sha256.New()
	n, err := p.WriteTo(h)
	if err != nil {
		return err
	}
	// Empty initial state's challenge has length zero, unlike a contribution.
	if uint64(n) != 192*(uint64(1)<<log2)+233 {
		return errors.New("initialized state wire size differs")
	}
	if err := emit("serialize-initial-state-to-hash", start, n, hex.EncodeToString(h.Sum(nil))); err != nil {
		return err
	}
	runtime.KeepAlive(p)
	return nil
}
func external(dir string) error {
	if !filepath.IsAbs(dir) {
		return errors.New("directory must be absolute")
	}
	p, err := filepath.EvalSymlinks(filepath.Dir(dir))
	if err != nil {
		return err
	}
	for {
		if _, err := os.Lstat(filepath.Join(p, ".git")); err == nil {
			return errors.New("directory must be outside Git")
		} else if !os.IsNotExist(err) {
			return err
		}
		if filepath.Dir(p) == p {
			break
		}
		p = filepath.Dir(p)
	}
	return nil
}

type Sample struct {
	Log2               int                      `json:"log2"`
	Measurement        mpcrehearsal.Measurement `json:"measurement"`
	Checkpoints        []Checkpoint             `json:"checkpoints"`
	HostAvailableBytes uint64                   `json:"hostAvailableBytes"`
}
type Report struct {
	Status                           string   `json:"status"`
	Failure                          string   `json:"failure,omitempty"`
	Scope                            string   `json:"scope"`
	BinarySHA256                     string   `json:"binarySha256"`
	AddressSpaceBytes                uint64   `json:"addressSpaceBytes"`
	CPUSeconds                       uint64   `json:"cpuSeconds"`
	WallSeconds                      int      `json:"wallSeconds"`
	FileBytes                        int      `json:"fileBytes"`
	Samples                          []Sample `json:"samples"`
	GameDomainInitializationMeasured bool     `json:"gameDomainInitializationMeasured"`
	GameDomainMpcMeasured            bool     `json:"gameDomainMpcMeasured"`
	ContributionsMeasured            bool     `json:"contributionsMeasured"`
	Phase2Measured                   bool     `json:"phase2Measured"`
	ProductionApproved               bool     `json:"productionApproved"`
}

func sweep(exe, dir string, domains []int, progress io.Writer) (report Report, err error) {
	return sweepUsing(exe, dir, domains, progress, memory)
}
func sweepUsing(exe, dir string, domains []int, progress io.Writer, availableMemory func() (uint64, error)) (report Report, err error) {
	if err = external(dir); err != nil {
		return report, err
	}
	if err = os.Mkdir(dir, 0700); err != nil {
		return report, err
	}
	b, err := os.ReadFile(exe)
	if err != nil {
		return report, err
	}
	h := sha256.Sum256(b)
	report = Report{Status: "incomplete", Scope: "Local native phase-1 initialization and streamed hash only; no contribution, verification, CS compilation or keys", BinarySHA256: hex.EncodeToString(h[:]), AddressSpaceBytes: addressBytes, CPUSeconds: cpuSeconds, WallSeconds: wallSeconds, FileBytes: fileBytes}
	defer func() {
		if err != nil {
			report.Failure = err.Error()
		}
		f, e := os.OpenFile(filepath.Join(dir, "report.json"), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if e != nil {
			err = e
			return
		}
		defer f.Close()
		enc := json.NewEncoder(f)
		enc.SetIndent("", "  ")
		if e = enc.Encode(report); e == nil {
			e = f.Sync()
		}
		if e != nil {
			err = e
		}
	}()
	for _, log2 := range domains {
		available, e := availableMemory()
		if e != nil {
			err = e
			return
		}
		if available < reserveAvailable {
			err = errors.New("host available memory below 12 GiB; worker not started")
			return
		}
		path := filepath.Join(dir, fmt.Sprintf("init-%d.jsonl", log2))
		fmt.Fprintf(progress, "domain 2^%d: bounded initialization starting\n", log2)
		m, e := mpcrehearsal.SuperviseWorker(exe, []string{"worker", "--log2", strconv.Itoa(log2), "--output", path}, wallSeconds*time.Second)
		sample := Sample{Log2: log2, Measurement: m, HostAvailableBytes: available}
		report.Samples = append(report.Samples, sample)
		if e != nil {
			err = e
			return
		}
		f, e := os.Open(path)
		if e != nil {
			err = e
			return
		}
		dec := json.NewDecoder(io.LimitReader(f, fileBytes+1))
		var points []Checkpoint
		for {
			var point Checkpoint
			e = dec.Decode(&point)
			if e == io.EOF {
				break
			}
			if e != nil {
				f.Close()
				err = e
				return
			}
			points = append(points, point)
		}
		f.Close()
		if len(points) != 2 || points[0].Stage != "initialize" || points[1].Stage != "serialize-initial-state-to-hash" || points[0].Log2 != log2 || points[1].Log2 != log2 {
			err = errors.New("worker checkpoints incomplete")
			return
		}
		decoded, e := hex.DecodeString(points[1].SHA256)
		if e != nil || len(decoded) != 32 || hex.EncodeToString(decoded) != points[1].SHA256 || points[1].WireBytes != int64(192*(uint64(1)<<log2)+233) {
			err = errors.New("worker hash/size checkpoint invalid")
			return
		}
		report.Samples[len(report.Samples)-1].Checkpoints = points
		fmt.Fprintf(progress, "domain 2^%d: exited, %d ms, peak %.2f GiB\n", log2, m.WallMilliseconds, float64(m.MaxRSSKiB)/(1<<20))
	}
	report.Status = "initialization-probe-complete"
	report.GameDomainInitializationMeasured = len(domains) == 2 && domains[0] == 22 && domains[1] == 23
	return report, nil
}
func run(args []string, w io.Writer) error {
	if len(args) == 0 {
		return errors.New("usage: mpc-local-probe run|worker --unsafe-test-only")
	}
	f := flag.NewFlagSet(args[0], flag.ContinueOnError)
	f.SetOutput(io.Discard)
	dir := f.String("directory", "", "new external evidence directory")
	output := f.String("output", "", "worker checkpoint file")
	log2 := f.Int("log2", 0, "worker domain")
	unsafe := f.Bool("unsafe-test-only", false, "initialization experiment, no secure setup")
	if err := f.Parse(args[1:]); err != nil {
		return err
	}
	if f.NArg() != 0 || !*unsafe {
		return errors.New("--unsafe-test-only required")
	}
	switch args[0] {
	case "worker":
		return measure(*log2, *output)
	case "run":
		exe, err := os.Executable()
		if err != nil {
			return err
		}
		_, err = sweep(exe, *dir, []int{22, 23}, w)
		return err
	default:
		return errors.New("unknown probe command")
	}
}
func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

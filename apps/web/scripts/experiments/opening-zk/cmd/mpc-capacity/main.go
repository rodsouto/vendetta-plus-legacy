package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"
)

func jsonEncoder(w io.Writer, v any) error { return json.NewEncoder(w).Encode(v) }
func exclusive(path string, data []byte) error {
	if len(data) > fileBytes {
		return errors.New("capacity report exceeds bound")
	}
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL|syscall.O_NOFOLLOW, 0600)
	if err != nil {
		return err
	}
	if n, err := f.Write(data); err != nil || n != len(data) {
		f.Close()
		if err != nil {
			return err
		}
		return io.ErrShortWrite
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	parent, err := os.Open(filepath.Dir(path))
	if err != nil {
		return err
	}
	defer parent.Close()
	return parent.Sync()
}
func externalDirectory(dir string) error {
	if !filepath.IsAbs(dir) {
		return errors.New("capacity output must be absolute and outside Git")
	}
	parent, err := filepath.EvalSymlinks(filepath.Dir(dir))
	if err != nil {
		return err
	}
	for p := parent; ; p = filepath.Dir(p) {
		if _, err := os.Lstat(filepath.Join(p, ".git")); err == nil {
			return errors.New("capacity output must stay outside Git")
		} else if !os.IsNotExist(err) {
			return err
		}
		if p == filepath.Dir(p) {
			break
		}
	}
	return nil
}

type Sample struct {
	Log2                  int          `json:"log2"`
	DomainSize            uint64       `json:"domainSize"`
	Status                string       `json:"status"`
	PID                   int          `json:"pid"`
	WallMilliseconds      int64        `json:"wallMilliseconds"`
	CPUUserMilliseconds   int64        `json:"cpuUserMilliseconds"`
	CPUSystemMilliseconds int64        `json:"cpuSystemMilliseconds"`
	MaxRSSBytes           int64        `json:"maxRssBytes"`
	SampledRSSBytes       uint64       `json:"sampledRssBytes"`
	CheckpointLog         string       `json:"checkpointLog"`
	CheckpointLogSHA256   string       `json:"checkpointLogSha256"`
	Checkpoints           []Checkpoint `json:"checkpoints"`
	Failure               string       `json:"failure"`
	Exited                bool         `json:"exited"`
}
type Report struct {
	Failure                   string   `json:"failure"`
	Scope                     string   `json:"scope"`
	Status                    string   `json:"status"`
	BinarySHA256              string   `json:"binarySha256"`
	StartedAt                 string   `json:"startedAt"`
	HostAvailableBytesAtStart uint64   `json:"hostAvailableBytesAtStart"`
	WorkerAddressSpaceBytes   uint64   `json:"workerAddressSpaceBytes"`
	ObservedRSSStopBytes      uint64   `json:"observedRssStopBytes"`
	RSSPollingMilliseconds    int      `json:"rssPollingMilliseconds"`
	WorkerCPUSeconds          int      `json:"workerCpuSeconds"`
	WorkerWallSeconds         int      `json:"workerWallSeconds"`
	WorkerFileBytes           int      `json:"workerFileBytes"`
	Samples                   []Sample `json:"samples"`
	GameTargets               []Model  `json:"gameTargets"`
	ProductionApproved        bool     `json:"productionApproved"`
	GameCircuitBytesVerified  bool     `json:"gameCircuitBytesVerified"`
	GameDomainMPCMeasured     bool     `json:"gameDomainMpcMeasured"`
	Phase2Measured            bool     `json:"phase2Measured"`
	AllStartedWorkersExited   bool     `json:"allStartedWorkersExited"`
}

func supervise(executable, logPath string, log2 int, wall time.Duration, rssStop uint64) (sample Sample, err error) {
	sample = Sample{Log2: log2, DomainSize: uint64(1) << log2, Status: "failed", CheckpointLog: filepath.Base(logPath)}
	f, err := os.OpenFile(logPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL|syscall.O_NOFOLLOW, 0600)
	if err != nil {
		return sample, err
	}
	started := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), wall)
	defer cancel()
	cmd := exec.CommandContext(ctx, executable, "worker", "--log2", fmt.Sprint(log2), "--unsafe-test-only")
	cmd.Env = append(os.Environ(), "GOMEMLIMIT=256MiB", "GOMAXPROCS=4", "GOPROXY=off", "GOFLAGS=-mod=readonly")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true, Pdeathsig: syscall.SIGKILL}
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return os.ErrProcessDone
		}
		return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	}
	cmd.WaitDelay = time.Second
	cmd.Stdout = f
	cmd.Stderr = f
	if err := cmd.Start(); err != nil {
		f.Close()
		return sample, err
	}
	sample.PID = cmd.Process.Pid
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	ticker := time.NewTicker(25 * time.Millisecond)
	defer ticker.Stop()
	var failure string
	waiting := true
	for waiting {
		select {
		case err = <-done:
			waiting = false
		case <-ticker.C:
			rss, exited, readErr := processRSS(sample.PID)
			// A worker may have become a zombie between polling and Wait. Final rusage
			// still checks its peak, including executions shorter than one poll interval.
			if readErr != nil && failure == "" {
				failure = "rss-observation-unavailable"
				_ = syscall.Kill(-sample.PID, syscall.SIGKILL)
			}
			if readErr == nil && !exited {
				if rss > sample.SampledRSSBytes {
					sample.SampledRSSBytes = rss
				}
				if rss > rssStop && failure == "" {
					failure = "observed-rss-limit"
					_ = syscall.Kill(-sample.PID, syscall.SIGKILL)
				}
			}
		}
	}
	sample.Exited = true
	sample.WallMilliseconds = time.Since(started).Milliseconds()
	sample.CPUUserMilliseconds = cmd.ProcessState.UserTime().Milliseconds()
	sample.CPUSystemMilliseconds = cmd.ProcessState.SystemTime().Milliseconds()
	if usage, ok := cmd.ProcessState.SysUsage().(*syscall.Rusage); ok {
		sample.MaxRSSBytes = usage.Maxrss * 1024
	}
	if uint64(sample.MaxRSSBytes) > rssStop && failure == "" {
		failure = "observed-rss-limit"
	}
	if ctx.Err() != nil && failure == "" {
		failure = "wall-timeout"
	}
	if syncErr := f.Sync(); syncErr != nil && err == nil {
		err = syncErr
	}
	if closeErr := f.Close(); closeErr != nil && err == nil {
		err = closeErr
	}
	raw, readErr := os.ReadFile(logPath)
	if readErr == nil && len(raw) <= fileBytes {
		sample.CheckpointLogSHA256 = digest(raw)
		decoder := json.NewDecoder(bytes.NewReader(raw))
		decoder.DisallowUnknownFields()
		for {
			var cp Checkpoint
			parseErr := decoder.Decode(&cp)
			if parseErr == io.EOF {
				break
			}
			if parseErr != nil {
				if err == nil {
					err = parseErr
				}
				break
			}
			sample.Checkpoints = append(sample.Checkpoints, cp)
		}
	} else if err == nil {
		err = errors.New("checkpoint log unavailable or oversized")
	}
	if failure != "" {
		sample.Failure = failure
		return sample, errors.New(failure)
	}
	if err != nil {
		sample.Failure = err.Error()
		return sample, err
	}
	expected := []string{"initialize", "contribute-1-and-serialize", "contribute-2-and-serialize", "decode-two-fresh", "verify-seal-and-hash", "complete"}
	if len(sample.Checkpoints) != len(expected) {
		sample.Failure = "incomplete-checkpoints"
		return sample, errors.New(sample.Failure)
	}
	for i, cp := range sample.Checkpoints {
		if cp.Operation != expected[i] || cp.DomainSize != sample.DomainSize {
			sample.Failure = "checkpoint-context-mismatch"
			return sample, errors.New(sample.Failure)
		}
	}
	sample.Status = "measured"
	return sample, nil
}
func sweep(executable, dir string, maximum int, progress io.Writer) (report Report, err error) {
	ladder, err := domains(maximum)
	if err != nil {
		return report, err
	}
	if err := externalDirectory(dir); err != nil {
		return report, err
	}
	if err := os.Mkdir(dir, 0700); err != nil {
		return report, err
	}
	binary, err := os.ReadFile(executable)
	if err != nil {
		return report, err
	}
	available, err := memoryField("/proc/meminfo", "MemAvailable")
	if err != nil {
		return report, err
	}
	report = Report{Scope: "Unsafe native phase-1 capacity only; fixed test challenge; no game CS, keys, independent ceremony or production approval", Status: "incomplete", BinarySHA256: digest(binary), StartedAt: time.Now().UTC().Format(time.RFC3339), HostAvailableBytesAtStart: available,
		WorkerAddressSpaceBytes: addressSpaceBytes, ObservedRSSStopBytes: observedRSSLimit, RSSPollingMilliseconds: 25, WorkerCPUSeconds: cpuSeconds, WorkerWallSeconds: wallSeconds, WorkerFileBytes: fileBytes, GameTargets: targets(), AllStartedWorkersExited: true}
	for _, log2 := range ladder {
		available, err = memoryField("/proc/meminfo", "MemAvailable")
		if err != nil {
			break
		}
		if available < minHostAvailable {
			err = errors.New("host available memory below experiment reserve")
			break
		}
		fmt.Fprintf(progress, "phase 1 domain 2^%d: starting bounded worker\n", log2)
		var sample Sample
		sample, err = supervise(executable, filepath.Join(dir, fmt.Sprintf("phase1-%d.jsonl", log2)), log2, wallSeconds*time.Second, observedRSSLimit)
		report.Samples = append(report.Samples, sample)
		if sample.PID != 0 && !sample.Exited {
			report.AllStartedWorkersExited = false
		}
		if err != nil {
			break
		}
		fmt.Fprintf(progress, "phase 1 domain 2^%d: exited, %d ms, peak RSS %.2f MiB\n", log2, sample.WallMilliseconds, float64(sample.MaxRSSBytes)/(1<<20))
	}
	if err == nil {
		report.Status = "bounded-phase1-sweep-complete"
	} else {
		report.Failure = err.Error()
	}
	data, marshalErr := json.MarshalIndent(report, "", "  ")
	if marshalErr != nil {
		return report, marshalErr
	}
	if writeErr := exclusive(filepath.Join(dir, "capacity-report.json"), append(data, '\n')); writeErr != nil {
		return report, writeErr
	}
	return report, err
}
func run(args []string, output io.Writer) error {
	if len(args) == 0 {
		return errors.New("usage: mpc-capacity run --directory /outside/git/new --max-log2 14 --unsafe-test-only")
	}
	flags := flag.NewFlagSet(args[0], flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	dir := flags.String("directory", "", "New external output directory")
	maximum := flags.Int("max-log2", 14, "Largest sweep domain exponent (3..16)")
	log2 := flags.Int("log2", 0, "Internal worker domain exponent")
	unsafe := flags.Bool("unsafe-test-only", false, "Acknowledge capacity experiment with fixed known challenge, not a secure setup")
	if err := flags.Parse(args[1:]); err != nil {
		return err
	}
	if flags.NArg() != 0 || !*unsafe {
		return errors.New("--unsafe-test-only required; no positional arguments")
	}
	switch args[0] {
	case "run":
		executable, err := os.Executable()
		if err != nil {
			return err
		}
		_, err = sweep(executable, *dir, *maximum, output)
		return err
	case "worker":
		if *log2 < 3 || *log2 > maxLog2 {
			return errors.New("capacity worker rejects full game domains")
		}
		if err := workerLimits(); err != nil {
			return err
		}
		return measure(*log2, output)
	default:
		return errors.New("unknown capacity command")
	}
}
func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "mpc-capacity:", err)
		os.Exit(1)
	}
}

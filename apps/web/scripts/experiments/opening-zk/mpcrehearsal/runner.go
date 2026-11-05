package mpcrehearsal

import (
	"bytes"
	stdctx "context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"

	"vendetta-opening-pairing-experiment/ceremony"
)

// Linux-only experiment. These are fixed test ceilings, not a production SLA.
const WorkerWallSeconds = 30
const WorkerAddressSpaceBytes = 4 << 30
const WorkerCPUSeconds = 20
const WorkerFileBytes = ceremony.MaxDocumentBytes

func LimitWorker() error {
	for resource, value := range map[int]uint64{syscall.RLIMIT_AS: WorkerAddressSpaceBytes, syscall.RLIMIT_CPU: WorkerCPUSeconds, syscall.RLIMIT_FSIZE: WorkerFileBytes, syscall.RLIMIT_CORE: 0} {
		if err := syscall.Setrlimit(resource, &syscall.Rlimit{Cur: value, Max: value}); err != nil {
			return fmt.Errorf("worker resource limit: %w", err)
		}
	}
	return nil
}

type Measurement struct {
	Command               string `json:"command"`
	PID                   int    `json:"pid"`
	WallMilliseconds      int64  `json:"wallMilliseconds"`
	CPUUserMilliseconds   int64  `json:"cpuUserMilliseconds"`
	CPUSystemMilliseconds int64  `json:"cpuSystemMilliseconds"`
	MaxRSSKiB             int64  `json:"maxRssKiB"`
}
type RunReport struct {
	BinarySHA256            string        `json:"binarySha256"`
	Verification            Verification  `json:"verification"`
	WorkerMeasurements      []Measurement `json:"workerMeasurements"`
	WorkerWallSeconds       int           `json:"workerWallSeconds"`
	WorkerCPUSeconds        int           `json:"workerCpuSeconds"`
	WorkerAddressSpaceBytes uint64        `json:"workerAddressSpaceBytes"`
	WorkerFileBytes         int           `json:"workerFileBytes"`
	AllWorkersExited        bool          `json:"allWorkersExited"`
}
type boundedOutput struct{ b bytes.Buffer }

func (b *boundedOutput) Write(p []byte) (int, error) {
	if b.b.Len()+len(p) > ceremony.MaxDocumentBytes {
		return 0, errors.New("worker output exceeds limit")
	}
	return b.b.Write(p)
}
func child(executable string, args []string) (Measurement, error) {
	return childWithin(executable, args, WorkerWallSeconds*time.Second)
}

// SuperviseWorker reuses group timeout/reaping for a separate experiment whose
// worker applies its own kernel limits. It does not change rehearsal ceilings.
func SuperviseWorker(executable string, args []string, wall time.Duration) (Measurement, error) {
	return childWithin(executable, args, wall)
}
func childWithin(executable string, args []string, wall time.Duration) (Measurement, error) {
	started := time.Now()
	ctx, cancel := stdctx.WithTimeout(stdctx.Background(), wall)
	defer cancel()
	cmd := exec.CommandContext(ctx, executable, append(args, "--unsafe-test-only")...)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true, Pdeathsig: syscall.SIGKILL}
	// Kill the complete worker group on timeout. A new worker starts only after
	// Wait confirms exit. The workers do not spawn descendants themselves.
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return os.ErrProcessDone
		}
		return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	}
	cmd.WaitDelay = time.Second
	cmd.Env = append(os.Environ(), "GOMEMLIMIT=256MiB", "GOMAXPROCS=2", "GOPROXY=off", "GOFLAGS=-mod=readonly")
	var output boundedOutput
	cmd.Stdout = &output
	cmd.Stderr = &output
	if err := cmd.Start(); err != nil {
		return Measurement{}, err
	}
	pid := cmd.Process.Pid
	err := cmd.Wait()
	measurement := Measurement{Command: args[0], PID: pid, WallMilliseconds: time.Since(started).Milliseconds()}
	if cmd.ProcessState != nil {
		measurement.CPUUserMilliseconds = cmd.ProcessState.UserTime().Milliseconds()
		measurement.CPUSystemMilliseconds = cmd.ProcessState.SystemTime().Milliseconds()
		if usage, ok := cmd.ProcessState.SysUsage().(*syscall.Rusage); ok {
			measurement.MaxRSSKiB = usage.Maxrss
		}
	}
	if err != nil {
		return measurement, fmt.Errorf("rehearsal worker %s failed: %w: %s", args[0], err, output.b.String())
	}
	return measurement, nil
}

// Run drives separate init, contributor, closure and verification processes.
// Failed runs remain intact and cannot be overwritten by retrying this path.
func Run(executable, dir string, progress io.Writer) (RunReport, error) {
	binary, err := os.ReadFile(executable)
	if err != nil {
		return RunReport{}, err
	}
	report := RunReport{BinarySHA256: ceremony.Digest(binary), WorkerWallSeconds: WorkerWallSeconds, WorkerCPUSeconds: WorkerCPUSeconds, WorkerAddressSpaceBytes: WorkerAddressSpaceBytes, WorkerFileBytes: WorkerFileBytes}
	run := func(args ...string) error {
		m, err := child(executable, args)
		report.WorkerMeasurements = append(report.WorkerMeasurements, m)
		if err == nil {
			fmt.Fprintf(progress, "%s: worker %d exited (%d ms)\n", m.Command, m.PID, m.WallMilliseconds)
		}
		return err
	}
	if err := run("init", "--directory", dir); err != nil {
		return report, err
	}
	config, err := readFile(filepath.Join(dir, "config.json"))
	if err != nil {
		return report, err
	}
	pin := ceremony.Digest(config)
	parent := ""
	for phase := 1; phase <= 2; phase++ {
		for index, id := range []string{"participant-a", "participant-b"} {
			if err := run("contribute", "--directory", dir, "--config-sha256", pin, "--phase1-closure-sha256", parent, "--phase", fmt.Sprint(phase), "--index", fmt.Sprint(index), "--key", filepath.Join(dir, id+"-test-identity.json")); err != nil {
				return report, err
			}
		}
		if err := run("close", "--directory", dir, "--config-sha256", pin, "--phase1-closure-sha256", parent, "--phase", fmt.Sprint(phase)); err != nil {
			return report, err
		}
		if phase == 1 {
			raw, err := readFile(filepath.Join(dir, closureName(1)))
			if err != nil {
				return report, err
			}
			parent = ceremony.Digest(raw)
		}
	}
	raw, err := readFile(filepath.Join(dir, closureName(2)))
	if err != nil {
		return report, err
	}
	if err := run("verify", "--directory", dir, "--config-sha256", pin, "--phase1-closure-sha256", parent, "--phase2-closure-sha256", ceremony.Digest(raw)); err != nil {
		return report, err
	}
	verification, err := readFile(filepath.Join(dir, "verification.json"))
	if err != nil {
		return report, err
	}
	if err := ceremony.DecodeDocument(verification, &report.Verification); err != nil {
		return report, err
	}
	report.AllWorkersExited = true
	result, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return report, err
	}
	if err := writeFile(filepath.Join(dir, "report.json"), append(result, '\n')); err != nil {
		return report, err
	}
	return report, nil
}

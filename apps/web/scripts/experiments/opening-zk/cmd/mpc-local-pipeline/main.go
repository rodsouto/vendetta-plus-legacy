// Unsafe local capacity pipeline; persisted public transcripts, never production approval.
package main

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
)

const addressBytes uint64 = 8 << 30
const cpuSeconds uint64 = 6000
const wallSeconds = 7200
const fileBytes uint64 = 2 << 30
const minAvailable uint64 = 12 << 30

func readKB(path, key string) (uint64, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer f.Close()
	s := bufio.NewScanner(io.LimitReader(f, 64<<10))
	for s.Scan() {
		v := strings.Fields(s.Text())
		if len(v) == 3 && v[0] == key+":" && v[2] == "kB" {
			n, err := strconv.ParseUint(v[1], 10, 64)
			return n * 1024, err
		}
	}
	if err := s.Err(); err != nil {
		return 0, err
	}
	return 0, fmt.Errorf("missing %s", key)
}

// Keep host pressure distinct from a worker exceeding its sampled RSS budget.
func rememberFailure(current *string, reason string) {
	if *current == "" {
		*current = reason
	}
}

func memoryStopReason(rss uint64, rssErr error, available uint64, hostErr error) string {
	return memoryStopReasonWithin(rss, rssErr, available, hostErr, 21<<29)
}
func memoryStopReasonWithin(rss uint64, rssErr error, available uint64, hostErr error, budget uint64) string {
	if hostErr != nil {
		return "host-memory-observation-unavailable"
	}
	if available < 4<<30 {
		return "host-memory-pressure"
	}
	if rssErr == nil && rss > budget {
		return "sampled-memory-budget-exceeded"
	}
	return ""
}

func diskFree(dir string) (uint64, error) {
	var stat syscall.Statfs_t
	err := syscall.Statfs(dir, &stat)
	return stat.Bavail * uint64(stat.Bsize), err
}
func outside(dir string) error {
	if !filepath.IsAbs(dir) {
		return errors.New("absolute output directory required")
	}
	p, err := filepath.EvalSymlinks(filepath.Dir(dir))
	if err != nil {
		return err
	}
	for {
		if _, err := os.Lstat(filepath.Join(p, ".git")); err == nil {
			return errors.New("output must be outside Git")
		} else if !os.IsNotExist(err) {
			return err
		}
		if p == filepath.Dir(p) {
			break
		}
		p = filepath.Dir(p)
	}
	return nil
}
func exclusiveJSON(path string, value any) error {
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL|syscall.O_NOFOLLOW, 0600)
	if err != nil {
		return err
	}
	defer f.Close()
	e := json.NewEncoder(f)
	e.SetIndent("", "  ")
	if err = e.Encode(value); err != nil {
		return err
	}
	if err = f.Sync(); err != nil {
		return err
	}
	return syncDirectory(filepath.Dir(path))
}
func syncDirectory(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return f.Sync()
}
func fileHash(path string) (string, error) {
	// This helper also runs in the supervisor after worker limits have ended.
	// Reject substituted special inputs before reading and bound growth as well
	// as the initial size, so hashing cannot become an unbounded follow-up stage.
	f, err := regular(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return "", err
	}
	if info.Size() <= 0 || uint64(info.Size()) > fileBytes {
		return "", errors.New("hash input must be nonempty and within 2 GiB budget")
	}
	h := sha256.New()
	n, err := io.Copy(h, io.LimitReader(f, info.Size()+1))
	if err != nil {
		return "", err
	}
	if n != info.Size() {
		return "", errors.New("hash input size changed")
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
func workerLimits() error {
	return limitsFor("contribute")
}

type Artifact struct {
	Schema               string `json:"schema"`
	Operation            string `json:"operation"`
	Log2                 int    `json:"log2"`
	Bytes                int64  `json:"bytes"`
	SHA256               string `json:"sha256"`
	ParentArtifactSHA256 string `json:"parentArtifactSha256"`
	ProductionApproved   bool   `json:"productionApproved"`
}

func contribute(log2 int, dir string) error {
	if log2 != 3 && log2 != 22 && log2 != 23 {
		return errors.New("only fixed test/game domains supported")
	}
	if err := workerLimits(); err != nil {
		return err
	}
	if log2 != 3 {
		mem, err := readKB("/proc/meminfo", "MemAvailable")
		if err != nil {
			return err
		}
		if mem < minAvailable {
			return errors.New("worker host headroom unavailable")
		}
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
		var usage syscall.Rusage
		if err := syscall.Getrusage(syscall.RUSAGE_SELF, &usage); err != nil {
			return err
		}
		if err := json.NewEncoder(log).Encode(map[string]any{"stage": stage, "at": time.Now().UTC().Format(time.RFC3339), "maxRssBytes": usage.Maxrss * 1024}); err != nil {
			return err
		}
		return log.Sync()
	}
	if err := emit("initialize-start"); err != nil {
		return err
	}
	p := mpcsetup.NewPhase1(uint64(1) << log2)
	if err := emit("contribution-start"); err != nil {
		return err
	}
	p.Contribute()
	if err := emit("contribution-complete"); err != nil {
		return err
	}
	f, err := os.OpenFile(filepath.Join(dir, "contribution.bin"), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	h := sha256.New()
	buffer := bufio.NewWriterSize(f, 1<<20)
	n, err := p.WriteTo(io.MultiWriter(buffer, h))
	if err == nil {
		err = buffer.Flush()
	}
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if err := syncDirectory(dir); err != nil {
		return err
	}
	if n != int64(192*(uint64(1)<<log2)+265) {
		return errors.New("native contribution size differs")
	}
	if err := emit("persist-complete"); err != nil {
		return err
	}
	runtime.KeepAlive(p)
	return exclusiveJSON(filepath.Join(dir, "artifact.json"), Artifact{Schema: "vendetta-unsafe-local-phase1-artifact-2", Operation: "first-contribution", Log2: log2, Bytes: n, SHA256: hex.EncodeToString(h.Sum(nil))})
}

type Report struct {
	Status                string           `json:"status"`
	Failure               string           `json:"failure,omitempty"`
	Operation             string           `json:"operation"`
	Log2                  int              `json:"log2"`
	BinarySHA256          string           `json:"binarySha256"`
	PID                   int              `json:"pid"`
	WallMilliseconds      int64            `json:"wallMilliseconds"`
	CPUUserMilliseconds   int64            `json:"cpuUserMilliseconds"`
	CPUSystemMilliseconds int64            `json:"cpuSystemMilliseconds"`
	MaxRSSBytes           int64            `json:"maxRssBytes"`
	Exited                bool             `json:"exited"`
	AddressSpaceBytes     uint64           `json:"addressSpaceBytes"`
	CPUSeconds            uint64           `json:"cpuSeconds"`
	WallSeconds           int              `json:"wallSeconds"`
	Artifact              *Artifact        `json:"artifact,omitempty"`
	Verification          *Verification    `json:"verification,omitempty"`
	CSInfo                *CSInfo          `json:"csInfo,omitempty"`
	Commons               *CommonsArtifact `json:"commons,omitempty"`
	ProductionApproved    bool             `json:"productionApproved"`
}

func supervise(exe, dir string, log2 int, wall time.Duration, hostMemory func() (uint64, error)) (report Report, err error) {
	return superviseOperation(exe, dir, log2, wall, hostMemory, "contribute", "", "")
}
func superviseOperation(exe, dir string, log2 int, wall time.Duration, hostMemory func() (uint64, error), operation, input, inputPin string) (report Report, err error) {
	return superviseConfigured(exe, dir, log2, wall, hostMemory, Options{Operation: operation, Input: input, InputPin: inputPin})
}

type Options struct {
	Operation, Input, InputPin, Previous, PreviousPin, CS, CSPin, Initialization, InitializationPin, Parent, ParentPin, Commons, CommonsPin string
	Staged                                                                                                                                  bool
	ResumeCache, ResumeCachePin                                                                                                             string
}

func superviseConfigured(exe, dir string, log2 int, wall time.Duration, hostMemory func() (uint64, error), options Options) (report Report, err error) {
	operation, input, inputPin := options.Operation, options.Input, options.InputPin
	if operation != "contribute" && operation != "continue" && operation != "verify" && operation != "inspect-cs" && operation != "seal" && operation != "phase2-init" && operation != "phase2-contribute" && operation != "phase2-verify" && operation != "phase2-seal" {
		return report, errors.New("unknown supervised operation")
	}
	if log2 != 3 && log2 != 22 && log2 != 23 {
		return report, errors.New("unsupported domain")
	}
	if err = outside(dir); err != nil {
		return report, err
	}
	if err = os.Mkdir(dir, 0700); err != nil {
		return report, err
	}
	pin, e := fileHash(exe)
	if e != nil {
		return report, e
	}
	report = Report{Status: "incomplete", Operation: "first-contribution", Log2: log2, BinarySHA256: pin, AddressSpaceBytes: addressBytes, CPUSeconds: cpuSeconds, WallSeconds: int(wall.Seconds())}
	neededMemory := minAvailable
	if operation == "verify" {
		report.Operation = "verify-first-contribution"
		if options.Previous != "" {
			report.Operation = "verify-second-contribution"
		}
		report.AddressSpaceBytes = 14 << 30
		neededMemory = 29 << 29
	}
	if operation == "continue" {
		report.Operation = "second-contribution"
		report.CPUSeconds = 9000
	}
	if operation == "inspect-cs" {
		report.Operation = "inspect-compiled-cs"
		report.AddressSpaceBytes = 6 << 30
		report.CPUSeconds = 120
		neededMemory = 10 << 30
	}
	if operation == "seal" {
		report.Operation = "seal-phase1"
		report.CPUSeconds = 9000
	}
	if operation == "phase2-contribute" || operation == "phase2-verify" {
		report.Operation = operation
		report.AddressSpaceBytes = 10 << 30
		report.CPUSeconds = 18000
		neededMemory = 10 << 30
	}
	if operation == "phase2-init" || operation == "phase2-seal" {
		report.Operation = operation
		report.AddressSpaceBytes = 14 << 30
		report.CPUSeconds = 86400
		neededMemory = 29 << 29
	}
	if (operation == "phase2-init" && options.Staged) || operation == "phase2-seal" {
		report.AddressSpaceBytes = 10 << 30
		neededMemory = 10 << 30
		if operation == "phase2-init" {
			neededMemory = 10 << 30
		}
	}
	defer func() {
		if err != nil {
			report.Failure = err.Error()
		}
		if e := exclusiveJSON(filepath.Join(dir, "report.json"), report); e != nil {
			err = e
		}
	}()
	mem, e := hostMemory()
	if e != nil {
		return report, e
	}
	if mem < neededMemory {
		return report, fmt.Errorf("host requires %d bytes available", neededMemory)
	}
	free, e := diskFree(dir)
	if e != nil {
		return report, e
	}
	requiredDisk := uint64(32 << 30)
	if log2 == 3 {
		requiredDisk = 64 << 20
	}
	if free < requiredDisk {
		return report, errors.New("host requires 32 GiB free disk")
	}
	f, e := os.OpenFile(filepath.Join(dir, "worker.txt"), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if e != nil {
		return report, e
	}
	defer f.Close()
	heartbeat, e := os.OpenFile(filepath.Join(dir, "heartbeat.jsonl"), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if e != nil {
		return report, e
	}
	defer heartbeat.Close()
	ctx, cancel := context.WithTimeout(context.Background(), wall)
	defer cancel()
	workerArgs := []string{"worker", "--log2", strconv.Itoa(log2), "--directory", filepath.Join(dir, "public"), "--unsafe-test-only"}
	if operation == "verify" {
		workerArgs[0] = "worker-verify"
		workerArgs = append(workerArgs, "--input", input, "--input-sha256", inputPin)
	}
	if operation == "continue" {
		workerArgs[0] = "worker-continue"
		workerArgs = append(workerArgs, "--input", input, "--input-sha256", inputPin)
	}
	if operation == "inspect-cs" {
		workerArgs[0] = "worker-cs"
		workerArgs = append(workerArgs, "--input", input, "--input-sha256", inputPin)
	}
	if operation == "seal" {
		workerArgs[0] = "worker-seal"
		workerArgs = append(workerArgs, "--input", input, "--input-sha256", inputPin)
	}
	if operation == "phase2-init" {
		workerArgs[0] = "worker-phase2-init"
		workerArgs = append(workerArgs, "--input", input, "--input-sha256", inputPin, "--cs", options.CS, "--cs-sha256", options.CSPin)
		if options.Staged {
			workerArgs = append(workerArgs, "--staged-initialization")
		}
		if options.ResumeCache != "" {
			workerArgs = append(workerArgs, "--resume-cache", options.ResumeCache, "--resume-cache-sha256", options.ResumeCachePin)
		}
	}
	if operation == "phase2-contribute" || operation == "phase2-verify" || operation == "phase2-seal" {
		workerArgs[0] = "worker-" + operation
		workerArgs = append(workerArgs, "--input", input, "--input-sha256", inputPin, "--initialization", options.Initialization, "--initialization-sha256", options.InitializationPin, "--parent-artifact", options.Parent, "--parent-artifact-sha256", options.ParentPin, "--commons", options.Commons, "--commons-sha256", options.CommonsPin, "--cs", options.CS)
	}
	if options.Previous != "" {
		workerArgs = append(workerArgs, "--previous-verification", options.Previous, "--previous-verification-sha256", options.PreviousPin)
	}
	cmd := exec.CommandContext(ctx, exe, workerArgs...)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true, Pdeathsig: syscall.SIGKILL}
	cmd.Stdout = f
	cmd.Stderr = f
	cmd.Env = append(os.Environ(), "GOMEMLIMIT=5GiB", "GOMAXPROCS=4", "GOPROXY=off")
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return os.ErrProcessDone
		}
		return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	}
	started := time.Now()
	if err = cmd.Start(); err != nil {
		return report, err
	}
	report.PID = cmd.Process.Pid
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	tick := time.NewTicker(10 * time.Second)
	defer tick.Stop()
	monitorInterval := time.Hour
	if operation == "verify" || operation == "phase2-init" || operation == "phase2-seal" || operation == "phase2-contribute" || operation == "phase2-verify" {
		monitorInterval = 100 * time.Millisecond
	}
	monitor := time.NewTicker(monitorInterval)
	defer monitor.Stop()
	sampledRSS := uint64(21 << 29)
	if operation == "phase2-contribute" || operation == "phase2-verify" || operation == "phase2-seal" {
		sampledRSS = 11 << 29
	}
	var failure string
	waiting := true
	for waiting {
		select {
		case err = <-done:
			waiting = false
		case <-monitor.C:
			rss, readErr := readKB(fmt.Sprintf("/proc/%d/status", report.PID), "VmRSS")
			available, memErr := hostMemory()
			if reason := memoryStopReasonWithin(rss, readErr, available, memErr, sampledRSS); reason != "" {
				if failure == "" {
					failure = reason
					_ = json.NewEncoder(heartbeat).Encode(map[string]any{"at": time.Now().UTC().Format(time.RFC3339), "event": "memory-stop", "failure": reason, "rssBytes": rss, "rssAvailable": readErr == nil, "hostAvailableBytes": available, "hostMemoryAvailable": memErr == nil})
					_ = heartbeat.Sync()
				}
				_ = syscall.Kill(-report.PID, syscall.SIGKILL)
			}
		case <-tick.C:
			rss, readErr := readKB(fmt.Sprintf("/proc/%d/status", report.PID), "VmRSS")
			if readErr != nil {
				status, statusErr := os.ReadFile(fmt.Sprintf("/proc/%d/stat", report.PID))
				pos := strings.LastIndex(string(status), ") ")
				gone := os.IsNotExist(statusErr) || errors.Is(statusErr, syscall.ESRCH)
				zombie := statusErr == nil && pos >= 0 && strings.HasPrefix(string(status)[pos+2:], "Z ")
				if !gone && !zombie {
					rememberFailure(&failure, "rss-observation-unavailable")
					_ = syscall.Kill(-report.PID, syscall.SIGKILL)
				}
			}
			available, memErr := hostMemory()
			if memErr != nil || available < 4<<30 {
				rememberFailure(&failure, "host-memory-pressure")
				_ = syscall.Kill(-report.PID, syscall.SIGKILL)
			}
			if e := json.NewEncoder(heartbeat).Encode(map[string]any{"at": time.Now().UTC().Format(time.RFC3339), "elapsedSeconds": int(time.Since(started).Seconds()), "rssBytes": rss, "rssAvailable": readErr == nil, "hostAvailableBytes": available}); e != nil {
				rememberFailure(&failure, "heartbeat-write-failed")
				_ = syscall.Kill(-report.PID, syscall.SIGKILL)
			}
			_ = heartbeat.Sync()
		}
	}
	report.Exited = true
	report.WallMilliseconds = time.Since(started).Milliseconds()
	report.CPUUserMilliseconds = cmd.ProcessState.UserTime().Milliseconds()
	report.CPUSystemMilliseconds = cmd.ProcessState.SystemTime().Milliseconds()
	if usage, ok := cmd.ProcessState.SysUsage().(*syscall.Rusage); ok {
		report.MaxRSSBytes = usage.Maxrss * 1024
	}
	if failure == "" && (operation == "verify" || operation == "phase2-init" || operation == "phase2-seal" || operation == "phase2-contribute" || operation == "phase2-verify") && report.MaxRSSBytes > int64(sampledRSS) {
		failure = "sampled-memory-budget-exceeded"
	}
	if failure != "" {
		return report, errors.New(failure)
	}
	if ctx.Err() != nil {
		return report, ctx.Err()
	}
	if err != nil {
		return report, err
	}
	if operation == "phase2-seal" {
		var info Phase2Keys
		metadataPin, e := fileHash(filepath.Join(dir, "public", "keys.json"))
		if e != nil {
			return report, e
		}
		if e = pinnedDocument(filepath.Join(dir, "public", "keys.json"), metadataPin, &info); e != nil {
			return report, e
		}
		if info.Schema != "vendetta-unsafe-local-phase2-keys-1" || info.Log2 != log2 || info.InitializationSHA256 != options.InitializationPin || info.SourceArtifactSHA256 != inputPin || info.VerificationSHA256 != options.PreviousPin || info.CommonsArtifactSHA256 != options.CommonsPin || info.Beacon != phase2CapacityBeacon || info.BeaconAfterClosureProven || !info.UnsafeLocalSetup || info.ProductionApproved || len(info.SHA256) != 5 {
			return report, errors.New("phase2 keys receipt context differs")
		}
		for _, name := range []string{"circuit.bin", "proving.key", "verifying.key", "Verifier.sol", "manifest.json"} {
			pin, e := fileHash(filepath.Join(dir, "public", name))
			if e != nil {
				return report, e
			}
			if pin != info.SHA256[name] {
				return report, errors.New("phase2 keys digest differs")
			}
		}
		report.Status = "phase2-sealed"
		return report, nil
	}
	if operation == "phase2-contribute" || operation == "phase2-verify" {
		info, e := pinnedInitialization(options.Initialization, options.InitializationPin, log2)
		if e != nil {
			return report, e
		}
		if operation == "phase2-contribute" {
			metadataPin, e := fileHash(filepath.Join(dir, "public", "artifact.json"))
			if e != nil {
				return report, e
			}
			a, e := pinnedPhase2Artifact(filepath.Join(dir, "public"), metadataPin, options.InitializationPin, log2, info.Shape)
			if e != nil {
				return report, e
			}
			if a.ParentArtifactSHA256 != inputPin {
				return report, errors.New("phase2 contribution predecessor differs")
			}
			pin, e := fileHash(filepath.Join(dir, "public", "contribution.bin"))
			if e != nil {
				return report, e
			}
			if pin != a.SHA256 {
				return report, errors.New("phase2 contribution digest differs")
			}
		} else {
			metadataPin, e := fileHash(filepath.Join(dir, "public", "verification.json"))
			if e != nil {
				return report, e
			}
			v, e := pinnedPhase2Verification(filepath.Join(dir, "public", "verification.json"), metadataPin, options.InitializationPin, inputPin, log2)
			if e != nil {
				return report, e
			}
			if v.ParentArtifactSHA256 != options.ParentPin || v.PreviousVerificationSHA256 != options.PreviousPin {
				return report, errors.New("phase2 verification predecessor differs")
			}
		}
		report.Status = operation + "-complete"
		return report, nil
	}
	if operation == "phase2-init" {
		f, e := regular(filepath.Join(dir, "public", "phase2-init.json"))
		if e != nil {
			return report, e
		}
		defer f.Close()
		var info Phase2InitInfo
		if e = json.NewDecoder(io.LimitReader(f, 64<<10)).Decode(&info); e != nil {
			return report, e
		}
		if info.Schema != "vendetta-unsafe-local-phase2-init-1" || info.Log2 != log2 || info.CSHash != options.CSPin || info.CommonsArtifactHash != inputPin || info.ProductionApproved {
			return report, errors.New("phase2 initialization receipt differs")
		}
		for name, pin := range map[string]string{"initial.bin": info.InitialHash, "evaluations.bin": info.EvaluationHash} {
			actual, e := fileHash(filepath.Join(dir, "public", name))
			if e != nil {
				return report, e
			}
			if actual != pin {
				return report, errors.New("phase2 persisted cache hash differs")
			}
		}
		report.Status = "phase2-initialized"
		return report, nil
	}
	if operation == "inspect-cs" {
		f, e := regular(filepath.Join(dir, "public", "cs.json"))
		if e != nil {
			return report, e
		}
		defer f.Close()
		data, e := io.ReadAll(io.LimitReader(f, 64<<10))
		if e != nil {
			return report, e
		}
		var info CSInfo
		if e = json.Unmarshal(data, &info); e != nil {
			return report, e
		}
		if info.Schema != "vendetta-local-compiled-cs-1" || info.SHA256 != inputPin || info.ProductionApproved || info.Shapes[0].Domain != uint64(1)<<log2 || info.Shapes[1].Domain != uint64(1)<<log2 {
			return report, errors.New("CS receipt context differs")
		}
		report.CSInfo = &info
		report.Status = "compiled-cs-loaded"
		return report, nil
	}
	if operation == "verify" {
		v, e := loadVerification(filepath.Join(dir, "public", "verification.json"), log2, inputPin)
		if e != nil {
			return report, e
		}
		if v.PreviousVerificationSHA256 != options.PreviousPin {
			return report, errors.New("verification predecessor differs")
		}
		report.Verification = v
		report.Status = "verification-complete"
		return report, nil
	}
	if operation == "seal" {
		f, e := regular(filepath.Join(dir, "public", "commons.json"))
		if e != nil {
			return report, e
		}
		defer f.Close()
		var info CommonsArtifact
		if e = json.NewDecoder(io.LimitReader(f, 64<<10)).Decode(&info); e != nil {
			return report, e
		}
		if info.Schema != "vendetta-unsafe-local-commons-1" || info.Log2 != log2 || info.SourceArtifactSHA256 != inputPin || info.VerificationSHA256 != options.PreviousPin || info.Bytes != int64(192*(uint64(1)<<log2)-56) || info.ProductionApproved || info.BeaconAfterClosureProven {
			return report, errors.New("sealed commons context differs")
		}
		pin, e := fileHash(filepath.Join(dir, "public", "commons.bin"))
		if e != nil {
			return report, e
		}
		if pin != info.SHA256 {
			return report, errors.New("sealed commons hash differs")
		}
		report.Commons = &info
		report.Status = "phase1-sealed"
		return report, nil
	}
	b, e := os.ReadFile(filepath.Join(dir, "public", "artifact.json"))
	if e != nil {
		return report, e
	}
	var artifact Artifact
	if e = json.Unmarshal(b, &artifact); e != nil {
		return report, e
	}
	if artifact.Schema != "vendetta-unsafe-local-phase1-artifact-2" || artifact.Log2 != log2 || artifact.Bytes != int64(192*(uint64(1)<<log2)+265) || artifact.ProductionApproved {
		return report, errors.New("artifact metadata invalid")
	}
	if operation == "continue" {
		if artifact.Operation != "second-contribution" || artifact.ParentArtifactSHA256 != inputPin {
			return report, errors.New("continuation artifact context differs")
		}
	} else if artifact.Operation != "first-contribution" || artifact.ParentArtifactSHA256 != "" {
		return report, errors.New("initial artifact context differs")
	}
	pin, e = fileHash(filepath.Join(dir, "public", "contribution.bin"))
	if e != nil {
		return report, e
	}
	if pin != artifact.SHA256 {
		return report, errors.New("persisted transcript digest differs")
	}
	report.Artifact = &artifact
	report.Status = "contribution-complete"
	return report, nil
}
func run(args []string, w io.Writer) error {
	if len(args) == 0 {
		return errors.New("usage: mpc-local-pipeline contribute|worker --directory NEW --log2 22 --unsafe-test-only")
	}
	f := flag.NewFlagSet(args[0], flag.ContinueOnError)
	f.SetOutput(io.Discard)
	dir := f.String("directory", "", "new external directory")
	log2 := f.Int("log2", 0, "domain exponent 22/23, or 3 for tests")
	unsafe := f.Bool("unsafe-test-only", false, "unsafe capacity, no production approval")
	input := f.String("input", "", "public input artifact directory")
	inputPin := f.String("input-sha256", "", "pinned artifact metadata digest")
	commons := f.String("commons", "", "sealed phase1 directory")
	commonsPin := f.String("commons-sha256", "", "sealed phase1 metadata digest")
	initialization := f.String("initialization", "", "phase2 initial cache directory")
	initializationPin := f.String("initialization-sha256", "", "phase2 initialization metadata digest")
	parent := f.String("parent-artifact", "", "preceding phase2 state directory")
	parentPin := f.String("parent-artifact-sha256", "", "preceding phase2 state metadata digest")
	cs := f.String("cs", "", "pinned compiled constraint system")
	csPin := f.String("cs-sha256", "", "compiled constraint system digest")
	staged := f.Bool("staged-initialization", false, "unsafe local disk-backed initialization; equivalent arithmetic adapter")
	resumeCache := f.String("resume-cache", "", "pinned staged cache index from a prior run")
	resumeCachePin := f.String("resume-cache-sha256", "", "staged cache index digest")
	previous := f.String("previous-verification", "", "previous verified transition receipt")
	previousPin := f.String("previous-verification-sha256", "", "pinned verification receipt digest")
	if err := f.Parse(args[1:]); err != nil {
		return err
	}
	if !*unsafe || f.NArg() != 0 {
		return errors.New("--unsafe-test-only required")
	}
	if *staged || *resumeCache != "" || *resumeCachePin != "" {
		if (args[0] != "phase2-init" && args[0] != "worker-phase2-init") || !*staged || (*resumeCache == "") != (*resumeCachePin == "") {
			return errors.New("staged cache flags require staged phase2-init and paired cache pins")
		}
	}
	switch args[0] {
	case "worker-phase2-contribute", "worker-phase2-verify", "phase2-contribute", "phase2-verify", "worker-phase2-seal", "phase2-seal":
		o := Options{Operation: strings.TrimPrefix(args[0], "worker-"), Input: *input, InputPin: *inputPin, Previous: *previous, PreviousPin: *previousPin, Initialization: *initialization, InitializationPin: *initializationPin, Parent: *parent, ParentPin: *parentPin, Commons: *commons, CommonsPin: *commonsPin, CS: *cs}
		if args[0] == "worker-phase2-seal" {
			return phase2Seal(*log2, *dir, o)
		}
		if args[0] == "worker-phase2-contribute" {
			return phase2Contribute(*log2, *dir, o)
		}
		if args[0] == "worker-phase2-verify" {
			return phase2Verify(*log2, *dir, o)
		}
		exe, err := os.Executable()
		if err != nil {
			return err
		}
		r, err := superviseConfigured(exe, *dir, *log2, 6*time.Hour, func() (uint64, error) { return readKB("/proc/meminfo", "MemAvailable") }, o)
		if err != nil {
			return err
		}
		return json.NewEncoder(w).Encode(r)
	case "worker-phase2-init":
		return phase2Initialize(*log2, *dir, *input, *inputPin, *cs, *csPin, *staged, *resumeCache, *resumeCachePin)
	case "phase2-init":
		exe, err := os.Executable()
		if err != nil {
			return err
		}
		r, err := superviseConfigured(exe, *dir, *log2, 12*time.Hour, func() (uint64, error) { return readKB("/proc/meminfo", "MemAvailable") }, Options{Operation: "phase2-init", Input: *input, InputPin: *inputPin, CS: *cs, CSPin: *csPin, Staged: *staged, ResumeCache: *resumeCache, ResumeCachePin: *resumeCachePin})
		if err != nil {
			return err
		}
		return json.NewEncoder(w).Encode(r)
	case "worker":
		return contribute(*log2, *dir)
	case "worker-verify":
		return verifyContribution(*log2, *dir, *input, *inputPin, *previous, *previousPin)
	case "worker-continue":
		return continueContribution(*log2, *dir, *input, *inputPin, *previous, *previousPin)
	case "worker-seal":
		return sealPhase1(*log2, *dir, *input, *inputPin, *previous, *previousPin)
	case "seal":
		exe, err := os.Executable()
		if err != nil {
			return err
		}
		r, err := superviseConfigured(exe, *dir, *log2, 10800*time.Second, func() (uint64, error) { return readKB("/proc/meminfo", "MemAvailable") }, Options{Operation: "seal", Input: *input, InputPin: *inputPin, Previous: *previous, PreviousPin: *previousPin})
		if err != nil {
			return err
		}
		return json.NewEncoder(w).Encode(r)
	case "worker-cs":
		return inspectCS(*dir, *input, *inputPin)
	case "inspect-cs":
		exe, err := os.Executable()
		if err != nil {
			return err
		}
		r, err := superviseConfigured(exe, *dir, *log2, 180*time.Second, func() (uint64, error) { return readKB("/proc/meminfo", "MemAvailable") }, Options{Operation: "inspect-cs", Input: *input, InputPin: *inputPin})
		if err != nil {
			return err
		}
		return json.NewEncoder(w).Encode(r)
	case "continue":
		exe, err := os.Executable()
		if err != nil {
			return err
		}
		r, err := superviseConfigured(exe, *dir, *log2, 10800*time.Second, func() (uint64, error) { return readKB("/proc/meminfo", "MemAvailable") }, Options{Operation: "continue", Input: *input, InputPin: *inputPin, Previous: *previous, PreviousPin: *previousPin})
		if err != nil {
			return err
		}
		return json.NewEncoder(w).Encode(r)
	case "verify":
		exe, err := os.Executable()
		if err != nil {
			return err
		}
		r, err := superviseConfigured(exe, *dir, *log2, wallSeconds*time.Second, func() (uint64, error) { return readKB("/proc/meminfo", "MemAvailable") }, Options{Operation: "verify", Input: *input, InputPin: *inputPin, Previous: *previous, PreviousPin: *previousPin})
		if err != nil {
			return err
		}
		return json.NewEncoder(w).Encode(r)
	case "contribute":
		exe, err := os.Executable()
		if err != nil {
			return err
		}
		r, err := supervise(exe, *dir, *log2, wallSeconds*time.Second, func() (uint64, error) { return readKB("/proc/meminfo", "MemAvailable") })
		if err != nil {
			return err
		}
		return json.NewEncoder(w).Encode(r)
	default:
		return errors.New("unknown pipeline operation")
	}
}
func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

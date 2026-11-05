package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
)

func TestCapacityModelAndBounds(t *testing.T) {
	for _, log2 := range []int{3, 10} {
		n := uint64(1) << log2
		p := mpcsetup.NewPhase1(n)
		p.Contribute()
		raw, err := encodeNative(p)
		if err != nil {
			t.Fatal(err)
		}
		m := model("test", log2)
		if uint64(len(raw)) != m.OneContributionBytes {
			t.Fatal("contribution byte estimate mismatch")
		}
		decoded, err := nativeRead(raw, n)
		if err != nil {
			t.Fatal(err)
		}
		commons, err := mpcsetup.VerifyPhase1(n, []byte("unsafe-test"), decoded)
		if err != nil {
			t.Fatal(err)
		}
		serialized, err := encodeNative(&commons)
		if err != nil {
			t.Fatal(err)
		}
		if uint64(len(serialized)) != m.SealedSRSBytes {
			t.Fatal("SRS byte estimate mismatch")
		}
		if _, err := nativeRead(raw, 0); err == nil {
			t.Fatal("zero domain accepted")
		}
		if _, err := nativeRead(raw, 1<<23); err == nil {
			t.Fatal("full domain accepted")
		}
		mutated := append([]byte{}, raw...)
		binary.BigEndian.PutUint64(mutated[288:296], ^uint64(0))
		if _, err := nativeRead(mutated, n); err == nil {
			t.Fatal("native domain bomb accepted")
		}
	}
	targets := targets()
	if targets[0].VerificationPointArraysBytes <= addressSpaceBytes || targets[1].VerificationPointArraysBytes <= addressSpaceBytes {
		t.Fatal("full-domain model no longer exceeds address budget; review gate")
	}
	for _, m := range targets {
		if m.Phase1Status != "not-run-exceeds-experiment-budget" || m.Phase2Status != "not-measured-requires-budgeted-game-cs" {
			t.Fatal("unmeasured target described as measured")
		}
	}
	for _, bad := range []int{0, 2, 17, 22, 23} {
		if _, err := domains(bad); err == nil {
			t.Fatal("unsafe domain admitted")
		}
	}
	for _, limit := range []int{3, 10, 13, 14, 16} {
		ladder, err := domains(limit)
		if err != nil {
			t.Fatal(err)
		}
		if ladder[len(ladder)-1] != limit {
			t.Fatal("ladder omits requested bound")
		}
	}
}
func helper(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "helper.sh")
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+body+"\n"), 0700); err != nil {
		t.Fatal(err)
	}
	return path
}
func TestCapacitySupervisorStopsAndWaits(t *testing.T) {
	for name, tc := range map[string]struct {
		body string
		wall time.Duration
		rss  uint64
		want string
	}{
		"timeout":    {"exec sleep 5", 100 * time.Millisecond, observedRSSLimit, "wall-timeout"},
		"rss":        {"exec sleep 5", time.Second, 1, "observed-rss-limit"},
		"incomplete": {"exit 0", time.Second, observedRSSLimit, "incomplete-checkpoints"},
	} {
		t.Run(name, func(t *testing.T) {
			path := helper(t, tc.body)
			log := filepath.Join(t.TempDir(), "checkpoints.jsonl")
			sample, err := supervise(path, log, 3, tc.wall, tc.rss)
			if err == nil || sample.Failure != tc.want || !sample.Exited || sample.Status == "measured" {
				t.Fatalf("bad failure classification: %#v %v", sample, err)
			}
			if err := syscall.Kill(sample.PID, 0); err != syscall.ESRCH {
				t.Fatalf("worker remains alive: %v", err)
			}
			if _, err := os.Stat(log); err != nil {
				t.Fatal("failure checkpoint log lost")
			}
		})
	}
}
func TestCapacitySweepStopsAfterFailure(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "run")
	exe := helper(t, "exit 0")
	report, err := sweep(exe, dir, 12, &bytes.Buffer{})
	if err == nil || len(report.Samples) != 1 || report.Status != "incomplete" || report.Failure == "" || !report.AllStartedWorkersExited {
		t.Fatalf("failed sweep continued or claimed success: %#v %v", report, err)
	}
	data, err := os.ReadFile(filepath.Join(dir, "capacity-report.json"))
	if err != nil {
		t.Fatal(err)
	}
	var persisted Report
	if err := json.Unmarshal(data, &persisted); err != nil {
		t.Fatal(err)
	}
	if persisted.Failure == "" || persisted.ProductionApproved || persisted.GameDomainMPCMeasured {
		t.Fatal("wrong persisted failure scope")
	}
	if _, err := os.Stat(filepath.Join(dir, "phase1-12.jsonl")); !os.IsNotExist(err) {
		t.Fatal("next worker started after failure")
	}
	if _, err := sweep(exe, dir, 3, &bytes.Buffer{}); err == nil {
		t.Fatal("existing run overwritten")
	}
	if _, err := sweep(exe, filepath.Join(t.TempDir(), "refused"), 23, &bytes.Buffer{}); err == nil {
		t.Fatal("full domain sweep admitted")
	}
}
func TestCapacityCLI(t *testing.T) {
	var output bytes.Buffer
	for _, args := range [][]string{{"run"}, {"worker", "--log2", "23", "--unsafe-test-only"}, {"unknown", "--unsafe-test-only"}} {
		if err := run(args, &output); err == nil {
			t.Fatalf("invalid arguments accepted: %v", args)
		}
	}
	base := t.TempDir()
	exe := filepath.Join(base, "capacity")
	build := exec.Command(filepath.Join(runtime.GOROOT(), "bin/go"), "build", "-mod=readonly", "-o", exe, ".")
	build.Env = append(os.Environ(), "GOPROXY=off", "GOMEMLIMIT=6GiB", "GOMAXPROCS=8")
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build: %v %s", err, out)
	}
	dir := filepath.Join(base, "run")
	out, err := exec.Command(exe, "run", "--directory", dir, "--max-log2", "3", "--unsafe-test-only").CombinedOutput()
	if err != nil {
		t.Fatalf("capacity command: %v %s", err, out)
	}
	raw, err := os.ReadFile(filepath.Join(dir, "capacity-report.json"))
	if err != nil {
		t.Fatal(err)
	}
	var report Report
	if err := json.Unmarshal(raw, &report); err != nil {
		t.Fatal(err)
	}
	if report.Status != "bounded-phase1-sweep-complete" || len(report.Samples) != 1 || len(report.Samples[0].Checkpoints) != 6 || !report.AllStartedWorkersExited {
		t.Fatal("incomplete capacity evidence")
	}
	if report.ProductionApproved || report.GameCircuitBytesVerified || report.GameDomainMPCMeasured || report.Phase2Measured {
		t.Fatal("capacity report overclaims evidence")
	}
	if len(report.BinarySHA256) != 64 || report.Samples[0].MaxRSSBytes == 0 {
		t.Fatal("missing binary/resource evidence")
	}
	out, err = exec.Command(exe, "run", "--directory", dir, "--max-log2", "3", "--unsafe-test-only").CombinedOutput()
	if err == nil || !strings.Contains(string(out), "file exists") {
		t.Fatal("existing output accepted")
	}
}

func TestRSSObservation(t *testing.T) {
	rss, exited, err := parseProcessRSS([]byte("State:\tR (running)\nVmRSS:\t123 kB\n"))
	if err != nil || exited || rss != 123*1024 {
		t.Fatal("RSS parser")
	}
	for _, raw := range []string{"State:\tZ (zombie)\n", "State:\tX (dead)\n"} {
		if _, exited, err := parseProcessRSS([]byte(raw)); err != nil || !exited {
			t.Fatal("exited worker mistaken for lost supervision")
		}
	}
	for _, raw := range []string{"State:\tR (running)\n", "State:\tR\nVmRSS:\tbad kB\n", "State:\tR\nVmRSS:\t123 MB\n"} {
		if _, _, err := parseProcessRSS([]byte(raw)); err == nil {
			t.Fatal("missing/invalid observation accepted")
		}
	}
	if _, _, err := parseProcessRSS(make([]byte, (64<<10)+1)); err == nil {
		t.Fatal("oversized observation accepted")
	}
}

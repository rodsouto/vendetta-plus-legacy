package main

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"vendetta-opening-pairing-experiment/mpcrehearsal"
)

func TestSeparateProcessRehearsal(t *testing.T) {
	base := t.TempDir()
	exe := filepath.Join(base, "rehearsal")
	build := exec.Command(filepath.Join(runtime.GOROOT(), "bin/go"), "build", "-o", exe, ".")
	build.Env = append(os.Environ(), "GOPROXY=off", "GOFLAGS=-mod=readonly", "GOMEMLIMIT=6GiB", "GOMAXPROCS=8")
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build: %v %s", err, out)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	dir := filepath.Join(base, "run")
	cmd := exec.CommandContext(ctx, exe, "run", "--directory", dir, "--unsafe-test-only")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("run: %v %s", err, out)
	}
	data, err := os.ReadFile(filepath.Join(dir, "report.json"))
	if err != nil {
		t.Fatal(err)
	}
	var report mpcrehearsal.RunReport
	if err := json.Unmarshal(data, &report); err != nil {
		t.Fatal(err)
	}
	if !report.AllWorkersExited || len(report.WorkerMeasurements) != 8 {
		t.Fatal("process lifecycle evidence missing")
	}
	pids := map[int]bool{}
	for _, m := range report.WorkerMeasurements {
		if m.PID == 0 || pids[m.PID] || m.MaxRSSKiB == 0 {
			t.Fatal("missing distinct process/resource measurements")
		}
		pids[m.PID] = true
	}
	if !report.Verification.ExtractionReproduced || !report.Verification.ProofVerified || report.Verification.ProductionApproved || report.Verification.BeaconAfterClosureProven || report.Verification.IndependentParticipants {
		t.Fatal("wrong evidence scope")
	}
	// Re-running into an existing directory fails in init and preserves report.
	out, err := exec.CommandContext(ctx, exe, "run", "--directory", dir, "--unsafe-test-only").CombinedOutput()
	if err == nil || !strings.Contains(string(out), "file exists") {
		t.Fatalf("existing run accepted: %v %s", err, out)
	}
	after, err := os.ReadFile(filepath.Join(dir, "report.json"))
	if err != nil || !bytes.Equal(data, after) {
		t.Fatal("existing run changed")
	}
}
func TestCLIRequiresUnsafeAcknowledgement(t *testing.T) {
	var output bytes.Buffer
	if err := run([]string{"run", "--directory", filepath.Join(t.TempDir(), "run")}, &output); err == nil || output.Len() != 0 {
		t.Fatal("unsafe acknowledgement not required")
	}
	if err := run([]string{"unknown", "--directory", "/tmp/unused", "--unsafe-test-only"}, &output); err == nil {
		t.Fatal("unknown command accepted")
	}
}

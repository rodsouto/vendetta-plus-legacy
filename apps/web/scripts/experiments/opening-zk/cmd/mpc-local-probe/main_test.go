package main

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestRealSmallWorker(t *testing.T) {
	dir := t.TempDir()
	exe := filepath.Join(dir, "probe")
	cmd := exec.Command(filepath.Join(runtime.GOROOT(), "bin/go"), "build", "-trimpath", "-buildvcs=false", "-o", exe, ".")
	cmd.Env = append(os.Environ(), "GOPROXY=off", "GOFLAGS=-mod=readonly")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("build: %v %s", err, out)
	}
	report, err := sweepUsing(exe, filepath.Join(dir, "run"), []int{3}, io.Discard, func() (uint64, error) { return 16 << 30, nil })
	if err != nil {
		t.Fatal(err)
	}
	if report.Status != "initialization-probe-complete" || len(report.Samples) != 1 || len(report.Samples[0].Checkpoints) != 2 || report.GameDomainInitializationMeasured || report.GameDomainMpcMeasured || report.ProductionApproved {
		t.Fatalf("wrong scope/result: %+v", report)
	}
	if report.Samples[0].Checkpoints[1].WireBytes != 1769 {
		t.Fatal("initial state size differs from native encoding")
	}
	if _, err := sweepUsing(exe, filepath.Join(dir, "run"), []int{3}, io.Discard, func() (uint64, error) { return 16 << 30, nil }); err == nil {
		t.Fatal("existing result overwritten")
	}
}

func TestFailureStopsAndPersists(t *testing.T) {
	for _, low := range []bool{false, true} {
		dir := t.TempDir()
		exe := filepath.Join(dir, "fail")
		if err := os.WriteFile(exe, []byte("#!/bin/sh\nexit 7\n"), 0700); err != nil {
			t.Fatal(err)
		}
		path := filepath.Join(dir, "run")
		available := uint64(16 << 30)
		if low {
			available = 1 << 30
		}
		r, err := sweepUsing(exe, path, []int{22, 23}, io.Discard, func() (uint64, error) { return available, nil })
		if err == nil || r.Status != "incomplete" || r.Failure == "" {
			t.Fatal("failure treated as success")
		}
		want := 1
		if low {
			want = 0
		}
		if len(r.Samples) != want {
			t.Fatal("next worker started after failure")
		}
		b, err := os.ReadFile(filepath.Join(path, "report.json"))
		if err != nil {
			t.Fatal(err)
		}
		var stored Report
		if err := json.Unmarshal(b, &stored); err != nil || stored.Status != "incomplete" {
			t.Fatal("failed report missing")
		}
	}
}

func TestBoundsBeforeAllocation(t *testing.T) {
	for _, args := range [][]string{{"worker", "--log2", "23"}, {"worker", "--log2", "24", "--unsafe-test-only"}, {"worker", "--log2", "16", "--unsafe-test-only"}, {"run", "unexpected", "--unsafe-test-only"}} {
		var out bytes.Buffer
		if err := run(args, &out); err == nil {
			t.Fatal("invalid arguments accepted")
		}
	}
	if err := external("relative"); err == nil {
		t.Fatal("relative output accepted")
	}
	root, err := exec.Command("git", "rev-parse", "--show-toplevel").Output()
	if err != nil {
		t.Fatal(err)
	}
	if err := external(filepath.Join(strings.TrimSpace(string(root)), "probe-output")); err == nil {
		t.Fatal("repository output accepted")
	}
}

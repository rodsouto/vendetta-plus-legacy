package mpcrehearsal

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func workerHelper() {
	mode := os.Getenv("VENDETTA_MPC_TEST_HELPER")
	if mode == "" {
		return
	}
	switch mode {
	case "timeout":
		for {
			time.Sleep(time.Second)
		}
	case "file-limit":
		if err := LimitWorker(); err != nil {
			os.Exit(10)
		}
		err := os.WriteFile(os.Getenv("VENDETTA_MPC_TEST_OUTPUT"), make([]byte, WorkerFileBytes+1), 0600)
		if err == nil {
			os.Exit(11)
		}
		os.Exit(0)
	case "failure":
		os.Exit(7)
	}
}
func TestWorkerLifecycle(t *testing.T) {
	if os.Getenv("VENDETTA_MPC_TEST_HELPER") != "" {
		workerHelper()
		return
	}
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("VENDETTA_MPC_TEST_HELPER", "timeout")
	m, err := childWithin(exe, []string{"-test.run=^TestWorkerLifecycle$", "--"}, 100*time.Millisecond)
	if err == nil || m.PID == 0 {
		t.Fatalf("worker timeout not enforced: %v", err)
	}
	// Wait has completed; the process no longer exists before another can start.
	if out, err := exec.Command("ps", "-p", strconv.Itoa(m.PID), "-o", "pid=").Output(); err == nil || len(strings.TrimSpace(string(out))) != 0 {
		t.Fatal("timed-out worker remains alive")
	}
	t.Setenv("VENDETTA_MPC_TEST_HELPER", "failure")
	m, err = childWithin(exe, []string{"-test.run=^TestWorkerLifecycle$", "--"}, time.Second)
	if err == nil || m.PID == 0 {
		t.Fatal("worker failure not propagated")
	}
	t.Setenv("VENDETTA_MPC_TEST_HELPER", "file-limit")
	path := filepath.Join(t.TempDir(), "limited")
	t.Setenv("VENDETTA_MPC_TEST_OUTPUT", path)
	if _, err := childWithin(exe, []string{"-test.run=^TestWorkerLifecycle$", "--"}, time.Second); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Size() > int64(WorkerFileBytes) {
		t.Fatal("kernel file size ceiling not enforced")
	}
}

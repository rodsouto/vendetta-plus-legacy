package main

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"testing"

	"github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	"vendetta-opening-pairing-experiment/ceremony"
	"vendetta-opening-pairing-experiment/mpcinspect"
)

func fixture(t *testing.T) (string, []string) {
	t.Helper()
	dir := t.TempDir()
	shape := mpcinspect.Shape{Schema: "vendetta-hidden-v2-native-shape-1", CircuitSHA256: strings.Repeat("c", 64), Phase: 1, Domain: 8, PrivateCommitted: []uint64{}}
	data, err := json.Marshal(shape)
	if err != nil {
		t.Fatal(err)
	}
	p1 := mpcsetup.NewPhase1(8)
	p1.Contribute()
	var transcript bytes.Buffer
	if _, err := p1.WriteTo(&transcript); err != nil {
		t.Fatal(err)
	}
	for name, b := range map[string][]byte{"shape.json": data, "transcript.bin": transcript.Bytes()} {
		if err := os.WriteFile(filepath.Join(dir, name), b, 0600); err != nil {
			t.Fatal(err)
		}
	}
	return dir, []string{"--shape", filepath.Join(dir, "shape.json"), "--shape-sha256", ceremony.Digest(data), "--transcript", filepath.Join(dir, "transcript.bin"), "--transcript-sha256", ceremony.Digest(transcript.Bytes())}
}

func TestCLIFramingOnly(t *testing.T) {
	_, args := fixture(t)
	var out bytes.Buffer
	if err := run(args, &out); err != nil {
		t.Fatal(err)
	}
	var result map[string]any
	if err := json.Unmarshal(out.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result["status"] != "framing-only" || result["framingChecked"] != true {
		t.Fatal(result)
	}
	for _, key := range []string{"productionApproved", "pointsValidated", "circuitBytesVerified", "mpcTranscriptVerified", "artifactBytesVerified"} {
		if result[key] != false {
			t.Fatalf("CLI claimed %s", key)
		}
	}
}

func TestCLIRejectsWithoutSuccess(t *testing.T) {
	dir, args := fixture(t)
	for name, mutate := range map[string]func([]string) []string{
		"shape-pin":            func(a []string) []string { a[3] = strings.Repeat("0", 64); return a },
		"transcript-pin":       func(a []string) []string { a[7] = strings.Repeat("0", 64); return a },
		"budget":               func(a []string) []string { return append(a, "--max-bytes", "1") },
		"budget-ceiling":       func(a []string) []string { return append(a, "--max-bytes", "2147483649") },
		"positionals":          func(a []string) []string { return append(a, "extra") },
		"shape-directory":      func(a []string) []string { a[1] = dir; return a },
		"transcript-directory": func(a []string) []string { a[5] = dir; return a },
	} {
		t.Run(name, func(t *testing.T) {
			var out bytes.Buffer
			if err := run(mutate(append([]string{}, args...)), &out); err == nil || out.Len() != 0 {
				t.Fatal("invalid invocation emitted success")
			}
		})
	}
	for _, index := range []int{1, 5} {
		for _, kind := range []string{"symlink", "fifo", "truncated"} {
			t.Run(args[index-1]+"/"+kind, func(t *testing.T) {
				path := filepath.Join(dir, strings.TrimPrefix(args[index-1], "--")+"-"+kind)
				var err error
				switch kind {
				case "symlink":
					err = os.Symlink(args[index], path)
				case "fifo":
					err = syscall.Mkfifo(path, 0600)
				case "truncated":
					err = os.WriteFile(path, []byte{1}, 0600)
				}
				if err != nil {
					t.Fatal(err)
				}
				invocation := append([]string{}, args...)
				invocation[index] = path
				var out bytes.Buffer
				if err := run(invocation, &out); err == nil || out.Len() != 0 {
					t.Fatal("special input emitted success")
				}
			})
		}
	}
}

func TestShellWrapper(t *testing.T) {
	dir, args := fixture(t)
	root, err := exec.Command("git", "rev-parse", "--show-toplevel").Output()
	if err != nil {
		t.Fatal(err)
	}
	script := filepath.Join(strings.TrimSpace(string(root)), "scripts/hidden-v2-mpc-inspect.sh")
	for _, style := range []string{"two-dashes", "equals", "one-dash", "one-dash-equals"} {
		t.Run(style, func(t *testing.T) {
			invocation := []string{script}
			for i := 0; i < len(args); i += 2 {
				key, value := args[i], args[i+1]
				if key == "--shape" || key == "--transcript" {
					value = filepath.Base(value)
				}
				if strings.HasPrefix(style, "one-dash") {
					key = strings.TrimPrefix(key, "-")
				}
				if strings.HasSuffix(style, "equals") {
					invocation = append(invocation, key+"="+value)
				} else {
					invocation = append(invocation, key, value)
				}
			}
			cmd := exec.Command("bash", invocation...)
			cmd.Dir = dir
			cmd.Env = append(os.Environ(), "VENDETTA_GO_BIN="+filepath.Join(runtime.GOROOT(), "bin/go"), "INIT_CWD="+dir)
			out, err := cmd.CombinedOutput()
			if err != nil || !bytes.Contains(out, []byte(`"status":"framing-only"`)) {
				t.Fatalf("wrapper: %v %s", err, out)
			}
		})
	}
	// A real binary process must return nonzero with no JSON on stdout.
	cmd := exec.Command("bash", append([]string{script}, append(args, "--max-bytes", "1")...)...)
	cmd.Env = append(os.Environ(), "VENDETTA_GO_BIN="+filepath.Join(runtime.GOROOT(), "bin/go"))
	var out, stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr
	if err := cmd.Run(); err == nil || out.Len() != 0 {
		t.Fatal("real CLI failure emitted success")
	}
}

func TestPnpmRelativePaths(t *testing.T) {
	dir, args := fixture(t)
	root, err := exec.Command("git", "rev-parse", "--show-toplevel").Output()
	if err != nil {
		t.Fatal(err)
	}
	caller := filepath.Join(strings.TrimSpace(string(root)), "apps", "web")
	for _, i := range []int{1, 5} {
		args[i], err = filepath.Rel(caller, args[i])
		if err != nil {
			t.Fatal(err)
		}
	}
	cmd := exec.Command("pnpm", append([]string{"--workspace-root", "inspect:mpc-hidden-v2"}, args...)...)
	cmd.Dir = caller
	env := []string{}
	for _, entry := range os.Environ() {
		if !strings.HasPrefix(entry, "INIT_CWD=") {
			env = append(env, entry)
		}
	}
	cmd.Env = append(env, "VENDETTA_GO_BIN="+filepath.Join(runtime.GOROOT(), "bin/go"))
	out, err := cmd.CombinedOutput()
	if err != nil || !bytes.Contains(out, []byte(`"status":"framing-only"`)) {
		t.Fatalf("pnpm invocation: %v %s; fixture %s", err, out, dir)
	}
}

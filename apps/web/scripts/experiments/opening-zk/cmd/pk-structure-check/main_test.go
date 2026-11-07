package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"testing"

	curve "github.com/consensys/gnark-crypto/ecc/bn254"
	"github.com/consensys/gnark-crypto/ecc/bn254/fr/fft"
	native "github.com/consensys/gnark/backend/groth16/bn254"
	"vendetta-opening-pairing-experiment/artifactcheck"
)

func digest(data []byte) string { h := sha256.Sum256(data); return hex.EncodeToString(h[:]) }
func synthetic(t *testing.T) ([]byte, []byte, []byte) {
	t.Helper()
	_, _, g1, g2 := curve.Generators()
	pk := new(native.ProvingKey)
	vk := new(native.VerifyingKey)
	pk.Domain = *fft.NewDomain(2, fft.WithoutPrecompute())
	pk.G1.Alpha = g1
	pk.G1.Beta = g1
	pk.G1.Delta = g1
	pk.G1.A = []curve.G1Affine{g1, g1}
	pk.G1.B = []curve.G1Affine{g1, g1}
	pk.G1.K = []curve.G1Affine{g1}
	pk.G1.Z = []curve.G1Affine{g1}
	pk.G2.Beta = g2
	pk.G2.Delta = g2
	pk.G2.B = []curve.G2Affine{g2, g2}
	pk.InfinityA = []bool{false, false}
	pk.InfinityB = []bool{false, false}
	vk.G1.Alpha = g1
	vk.G1.Beta = g1
	vk.G1.Delta = g1
	vk.G1.K = []curve.G1Affine{g1}
	vk.G2.Beta = g2
	vk.G2.Delta = g2
	vk.G2.Gamma = g2
	var p, v bytes.Buffer
	if _, err := pk.WriteTo(&p); err != nil {
		t.Fatal(err)
	}
	if _, err := vk.WriteTo(&v); err != nil {
		t.Fatal(err)
	}
	m := artifactcheck.CompiledMetadata{Schema: "vendetta-hidden-v2-compiled-cs-1", Kind: "synthetic", SHA256: digest([]byte("synthetic relation declaration")), Bytes: 1, Domain: 2, Constraints: 2, InternalVariables: 1, Commitments: []artifactcheck.CompiledCommitment{}}
	data, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	return p.Bytes(), v.Bytes(), data
}
func TestCommand(t *testing.T) {
	pk, vk, metadata := synthetic(t)
	root := t.TempDir()
	paths := map[string]string{}
	for name, data := range map[string][]byte{"pk": pk, "vk": vk, "metadata": metadata} {
		path := filepath.Join(root, name)
		if err := os.WriteFile(path, data, 0600); err != nil {
			t.Fatal(err)
		}
		paths[name] = path
	}
	var m artifactcheck.CompiledMetadata
	if err := json.Unmarshal(metadata, &m); err != nil {
		t.Fatal(err)
	}
	args := []string{"--pk", paths["pk"], "--pk-sha256", digest(pk), "--vk", paths["vk"], "--vk-sha256", digest(vk), "--metadata", paths["metadata"], "--metadata-sha256", digest(metadata), "--circuit-sha256", m.SHA256}
	var out bytes.Buffer
	if err := run(args, &out); err != nil {
		t.Fatal(err)
	}
	var result artifactcheck.PKResult
	if err := json.Unmarshal(out.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if !result.SharedParametersMatchVK || result.FullKeyRelationVerified || result.AllPKPointsValidated || result.ProductionApproved {
		t.Fatal("wrong command scope")
	}
	out.Reset()
	nativeArgs := append(append([]string{}, args...), "--validate-points", "--max-points", "65536")
	if err := run(nativeArgs, &out); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(out.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if !result.AllPKPointsValidated || result.FullKeyRelationVerified || result.ProductionApproved {
		t.Fatal("wrong native command scope")
	}
	for _, extra := range [][]string{{"--validate-points"}, {"--max-points", "1"}, {"--validate-points", "--max-points", "1"}, {"--validate-points", "--max-points", "65537"}, {"unexpected"}, {"--max-bytes", "1"}, {"--max-bytes", "2147483649"}, {"--metadata-sha256", digest([]byte("wrong"))}, {"--pk-sha256", digest([]byte("wrong"))}, {"--circuit-sha256", digest([]byte("another CS"))}} {
		out.Reset()
		if err := run(append(append([]string{}, args...), extra...), &out); err == nil || out.Len() != 0 {
			t.Fatal("failure emitted success")
		}
	}
}
func TestRegularFiles(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "target")
	if err := os.WriteFile(target, []byte{1, 2}, 0600); err != nil {
		t.Fatal(err)
	}
	if f, err := regular(target, 1); err == nil {
		f.Close()
		t.Fatal("oversize accepted")
	}
	for _, kind := range []string{"symlink", "fifo", "directory", "empty"} {
		t.Run(kind, func(t *testing.T) {
			path := filepath.Join(root, kind)
			var err error
			switch kind {
			case "symlink":
				err = os.Symlink(target, path)
			case "fifo":
				err = syscall.Mkfifo(path, 0600)
			case "directory":
				err = os.Mkdir(path, 0700)
			case "empty":
				err = os.WriteFile(path, nil, 0600)
			}
			if err != nil {
				t.Fatal(err)
			}
			if f, err := regular(path, 65536); err == nil {
				f.Close()
				t.Fatal("special file accepted")
			}
		})
	}
}

func TestNativePointWrapper(t *testing.T) {
	pk, vk, metadata := synthetic(t)
	dir := t.TempDir()
	for name, data := range map[string][]byte{"pk": pk, "vk": vk, "metadata": metadata} {
		if err := os.WriteFile(filepath.Join(dir, name), data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	var m artifactcheck.CompiledMetadata
	if err := json.Unmarshal(metadata, &m); err != nil {
		t.Fatal(err)
	}
	rootBytes, err := exec.Command("git", "rev-parse", "--show-toplevel").Output()
	if err != nil {
		t.Fatal(err)
	}
	root := strings.TrimSpace(string(rootBytes))
	baseArgs := []string{"--pk", "pk", "--pk-sha256", digest(pk), "--vk", "vk", "--vk-sha256", digest(vk), "--metadata", "metadata", "--metadata-sha256", digest(metadata), "--circuit-sha256", m.SHA256, "--validate-points", "--max-points", "65536"}
	for _, mode := range []string{"bash-relative", "pnpm-relative"} {
		t.Run(mode, func(t *testing.T) {
			args := append([]string{}, baseArgs...)
			var cmd *exec.Cmd
			caller := dir
			if mode == "bash-relative" {
				cmd = exec.Command("bash", append([]string{filepath.Join(root, "scripts/hidden-v2-pk-structure-check.sh")}, args...)...)
			} else {
				caller = filepath.Join(root, "apps/web")
				for _, i := range []int{1, 5, 9} {
					args[i], err = filepath.Rel(caller, filepath.Join(dir, args[i]))
					if err != nil {
						t.Fatal(err)
					}
				}
				cmd = exec.Command("pnpm", append([]string{"--workspace-root", "check:pk-structure-hidden-v2"}, args...)...)
			}
			cmd.Dir = caller
			cmd.Env = append(os.Environ(), "VENDETTA_GO_BIN="+filepath.Join(runtime.GOROOT(), "bin/go"), "INIT_CWD="+caller)
			out, err := cmd.CombinedOutput()
			if err != nil || !bytes.Contains(out, []byte(`"status":"pk-points-structure-and-shared-parameters-verified"`)) || !bytes.Contains(out, []byte(`"allPkPointsValidated":true`)) {
				t.Fatalf("native wrapper failed: %v %s", err, out)
			}
		})
	}
	// Invoke the actual built worker through the wrapper and require no stdout
	// success when an invalid point budget is supplied.
	badArgs := append(append([]string{}, baseArgs...), "--max-points", "1")
	cmd := exec.Command("bash", append([]string{filepath.Join(root, "scripts/hidden-v2-pk-structure-check.sh")}, badArgs...)...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "VENDETTA_GO_BIN="+filepath.Join(runtime.GOROOT(), "bin/go"), "INIT_CWD="+dir)
	var out, stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr
	if err := cmd.Run(); err == nil || out.Len() != 0 || !bytes.Contains(stderr.Bytes(), []byte("point validation exceeds")) {
		t.Fatalf("failed native wrapper emitted success: %v %s %s", err, out.Bytes(), stderr.Bytes())
	}
}

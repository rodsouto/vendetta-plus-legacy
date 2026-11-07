package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"syscall"
	"testing"

	curve "github.com/consensys/gnark-crypto/ecc/bn254"
	native "github.com/consensys/gnark/backend/groth16/bn254"
	"vendetta-opening-pairing-experiment/artifactcheck"
)

func pin(data []byte) string { h := sha256.Sum256(data); return hex.EncodeToString(h[:]) }
func TestCommandAndFailures(t *testing.T) {
	// Synthetic finite points test the relation checker, not a usable proof system.
	_, _, g1, g2 := curve.Generators()
	vk := new(native.VerifyingKey)
	vk.G1.Alpha = g1
	vk.G1.Beta = g1
	vk.G1.Delta = g1
	vk.G1.K = []curve.G1Affine{g1, g1}
	vk.G2.Beta = g2
	vk.G2.Gamma = g2
	vk.G2.Delta = g2
	if err := vk.Precompute(); err != nil {
		t.Fatal(err)
	}
	var key, source bytes.Buffer
	if _, err := vk.WriteTo(&key); err != nil {
		t.Fatal(err)
	}
	if err := vk.ExportSolidity(&source); err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	keyPath, sourcePath := filepath.Join(root, "verifying.key"), filepath.Join(root, "Verifier.sol")
	if err := os.WriteFile(keyPath, key.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(sourcePath, source.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	args := []string{"--vk", keyPath, "--vk-sha256", pin(key.Bytes()), "--solidity", sourcePath, "--solidity-sha256", pin(source.Bytes()), "--public-inputs", "1"}
	var output bytes.Buffer
	if err := run(args, &output); err != nil {
		t.Fatal(err)
	}
	var result artifactcheck.Result
	if err := json.Unmarshal(output.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if !result.SolidityExportMatches || result.ProductionApproved {
		t.Fatal("wrong command scope")
	}
	for _, extra := range [][]string{{"unexpected"}, {"--unknown"}, {"--public-inputs", "2"}, {"--vk-sha256", pin([]byte("wrong"))}} {
		output.Reset()
		if err := run(append(append([]string{}, args...), extra...), &output); err == nil || output.Len() != 0 {
			t.Fatal("failure emitted success")
		}
	}
}
func TestRegularInputBudget(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "input")
	if err := os.WriteFile(path, []byte{1, 2}, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := readRegular(path, 1); err == nil {
		t.Fatal("oversize accepted")
	}
	for i, kind := range []string{"symlink", "fifo", "directory", "empty"} {
		t.Run(kind, func(t *testing.T) {
			candidate := filepath.Join(root, strconv.Itoa(i))
			var err error
			switch kind {
			case "symlink":
				err = os.Symlink(path, candidate)
			case "fifo":
				err = syscall.Mkfifo(candidate, 0600)
			case "directory":
				err = os.Mkdir(candidate, 0700)
			case "empty":
				err = os.WriteFile(candidate, nil, 0600)
			}
			if err != nil {
				t.Fatal(err)
			}
			if _, err = readRegular(candidate, 65536); err == nil {
				t.Fatal("special/empty input accepted")
			}
		})
	}
}

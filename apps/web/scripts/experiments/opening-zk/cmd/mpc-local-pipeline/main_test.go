package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	"github.com/consensys/gnark/backend/solidity"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
	"vendetta-opening-pairing-experiment/mpcinspect"
	"vendetta-opening-pairing-experiment/mpcstream"
)

type pipelineCircuit struct {
	X      frontend.Variable
	Y      frontend.Variable `gnark:",public"`
	Commit bool              `gnark:"-"`
}

func (c *pipelineCircuit) Define(api frontend.API) error {
	x := c.X
	for range 5 {
		x = api.Mul(x, x)
	}
	api.AssertIsEqual(x, c.Y)
	if c.Commit {
		commitment, err := api.(frontend.Committer).Commit(c.X, c.Y)
		if err != nil {
			return err
		}
		api.AssertIsDifferent(commitment, 0)
	}
	return nil
}

func TestRealPersistedContribution(t *testing.T) {
	for _, commit := range []bool{false, true} {
		for _, staged := range []bool{false, true} {
			t.Run(fmt.Sprintf("commitment=%v/staged=%v", commit, staged), func(t *testing.T) { testRealPersistedContribution(t, commit, staged) })
		}
	}
}
func testRealPersistedContribution(t *testing.T, commit, staged bool) {
	dir := t.TempDir()
	exe := filepath.Join(dir, "pipeline")
	cmd := exec.Command(filepath.Join(runtime.GOROOT(), "bin/go"), "build", "-trimpath", "-buildvcs=false", "-o", exe, ".")
	cmd.Env = append(os.Environ(), "GOPROXY=off", "GOFLAGS=-mod=readonly")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("build: %v %s", err, out)
	}
	output := filepath.Join(dir, "run")
	r, err := supervise(exe, output, 3, 10*time.Second, func() (uint64, error) { return 16 << 30, nil })
	if err != nil {
		t.Fatal(err)
	}
	if r.Status != "contribution-complete" || !r.Exited || r.Artifact == nil || r.ProductionApproved {
		t.Fatal("incomplete contribution")
	}
	f, err := os.Open(filepath.Join(output, "public", "contribution.bin"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	shape := mpcinspect.Shape{Schema: "vendetta-hidden-v2-native-shape-1", CircuitSHA256: strings.Repeat("a", 64), Phase: 1, Domain: 8, PrivateCommitted: []uint64{}}
	native, err := mpcinspect.Decode(f, shape, r.Artifact.SHA256, 1<<20, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	if err := mpcsetup.NewPhase1(8).Verify(native.Phase1); err != nil {
		t.Fatal(err)
	}
	metaPin, err := fileHash(filepath.Join(output, "public", "artifact.json"))
	if err != nil {
		t.Fatal(err)
	}
	verified, err := superviseOperation(exe, filepath.Join(dir, "verified"), 3, 10*time.Second, func() (uint64, error) { return 16 << 30, nil }, "verify", filepath.Join(output, "public"), metaPin)
	if err != nil || verified.Status != "verification-complete" || verified.Verification == nil || !verified.Verification.NativeTransitionVerified || verified.ProductionApproved {
		detail, _ := os.ReadFile(filepath.Join(dir, "verified", "worker.txt"))
		t.Fatalf("compact verification: %v %+v %s", err, verified, detail)
	}
	verificationPath := filepath.Join(dir, "verified", "public", "verification.json")
	verificationPin, err := fileHash(verificationPath)
	if err != nil {
		t.Fatal(err)
	}
	secondDir := filepath.Join(dir, "second")
	second, err := superviseConfigured(exe, secondDir, 3, 10*time.Second, func() (uint64, error) { return 16 << 30, nil }, Options{Operation: "continue", Input: filepath.Join(output, "public"), InputPin: metaPin, Previous: verificationPath, PreviousPin: verificationPin})
	if err != nil || second.Artifact == nil || second.Artifact.ParentArtifactSHA256 != metaPin {
		detail, _ := os.ReadFile(filepath.Join(secondDir, "worker.txt"))
		t.Fatalf("second contribution: %v %+v %s", err, second, detail)
	}
	secondMetaPin, err := fileHash(filepath.Join(secondDir, "public", "artifact.json"))
	if err != nil {
		t.Fatal(err)
	}
	secondVerified, err := superviseConfigured(exe, filepath.Join(dir, "second-verified"), 3, 10*time.Second, func() (uint64, error) { return 16 << 30, nil }, Options{Operation: "verify", Input: filepath.Join(secondDir, "public"), InputPin: secondMetaPin, Previous: verificationPath, PreviousPin: verificationPin})
	if err != nil || secondVerified.Verification == nil || secondVerified.Verification.PreviousVerificationSHA256 != verificationPin {
		detail, _ := os.ReadFile(filepath.Join(dir, "second-verified", "worker.txt"))
		t.Fatalf("second verification: %v %+v %s", err, secondVerified, detail)
	}
	secondVerificationPath := filepath.Join(dir, "second-verified", "public", "verification.json")
	secondVerificationPin, err := fileHash(secondVerificationPath)
	if err != nil {
		t.Fatal(err)
	}
	sealedDir := filepath.Join(dir, "sealed")
	sealed, err := superviseConfigured(exe, sealedDir, 3, 10*time.Second, func() (uint64, error) { return 16 << 30, nil }, Options{Operation: "seal", Input: filepath.Join(secondDir, "public"), InputPin: secondMetaPin, Previous: secondVerificationPath, PreviousPin: secondVerificationPin})
	if err != nil || sealed.Commons == nil {
		detail, _ := os.ReadFile(filepath.Join(sealedDir, "worker.txt"))
		t.Fatalf("seal: %v %+v %s", err, sealed, detail)
	}
	var contributions []*mpcsetup.Phase1
	for _, p := range []string{filepath.Join(output, "public", "contribution.bin"), filepath.Join(secondDir, "public", "contribution.bin")} {
		b, err := os.ReadFile(p)
		if err != nil {
			t.Fatal(err)
		}
		value := new(mpcsetup.Phase1)
		if _, err := value.ReadFrom(bytes.NewReader(b)); err != nil {
			t.Fatal(err)
		}
		contributions = append(contributions, value)
	}
	standard, err := mpcsetup.VerifyPhase1(8, []byte(capacityBeacon), contributions...)
	if err != nil {
		t.Fatal(err)
	}
	var expected bytes.Buffer
	if _, err := standard.WriteTo(&expected); err != nil {
		t.Fatal(err)
	}
	actual, err := os.ReadFile(filepath.Join(sealedDir, "public", "commons.bin"))
	if err != nil || !bytes.Equal(actual, expected.Bytes()) {
		t.Fatal("streamed pipeline seal differs from native VerifyPhase1")
	}

	compiled, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &pipelineCircuit{Commit: commit})
	if err != nil {
		t.Fatal(err)
	}
	if ecc.NextPowerOfTwo(uint64(compiled.GetNbConstraints())) != 8 {
		t.Fatal("test circuit domain differs")
	}
	csPath := filepath.Join(dir, "circuit.bin")
	_, csPin, err := persistNative(csPath, compiled)
	if err != nil {
		t.Fatal(err)
	}
	commonsPin, err := fileHash(filepath.Join(sealedDir, "public", "commons.json"))
	if err != nil {
		t.Fatal(err)
	}
	initDir := filepath.Join(dir, "phase2-init")
	initialized, err := superviseConfigured(exe, initDir, 3, 20*time.Second, func() (uint64, error) { return 16 << 30, nil }, Options{Operation: "phase2-init", Input: filepath.Join(sealedDir, "public"), InputPin: commonsPin, CS: csPath, CSPin: csPin, Staged: staged})
	if err != nil || initialized.Status != "phase2-initialized" {
		detail, _ := os.ReadFile(filepath.Join(initDir, "worker.txt"))
		t.Fatalf("phase2 init: %v %+v %s", err, initialized, detail)
	}
	var info Phase2InitInfo
	raw, err := os.ReadFile(filepath.Join(initDir, "public", "phase2-init.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(raw, &info); err != nil {
		t.Fatal(err)
	}
	initial, err := os.ReadFile(filepath.Join(initDir, "public", "initial.bin"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = mpcinspect.DecodeInitialPhase2(bytes.NewReader(initial), info.Shape, info.InitialHash, 1<<20, 1<<20); err != nil {
		t.Fatal(err)
	}
	evaluation, err := os.ReadFile(filepath.Join(initDir, "public", "evaluations.bin"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = mpcstream.ReadEvaluations(bytes.NewReader(evaluation), info.Evaluations, info.EvaluationHash, 1<<20, 1<<20); err != nil {
		t.Fatal(err)
	}

	if staged {
		cache := filepath.Join(initDir, "public", "staged-cache", "index-11.json")
		cachePin, err := fileHash(cache)
		if err != nil {
			t.Fatal(err)
		}
		resumedDir := filepath.Join(dir, "phase2-resumed")
		resumed, err := superviseConfigured(exe, resumedDir, 3, 20*time.Second, func() (uint64, error) { return 16 << 30, nil }, Options{Operation: "phase2-init", Input: filepath.Join(sealedDir, "public"), InputPin: commonsPin, CS: csPath, CSPin: csPin, Staged: true, ResumeCache: cache, ResumeCachePin: cachePin})
		if err != nil || resumed.Status != "phase2-initialized" {
			detail, _ := os.ReadFile(filepath.Join(resumedDir, "worker.txt"))
			t.Fatalf("staged process resume: %v %s", err, detail)
		}
		for name, want := range map[string][]byte{"initial.bin": initial, "evaluations.bin": evaluation} {
			got, err := os.ReadFile(filepath.Join(resumedDir, "public", name))
			if err != nil || !bytes.Equal(got, want) {
				t.Fatalf("resumed %s differs: %v", name, err)
			}
		}
	}

	initPublic := filepath.Join(initDir, "public")
	initialPin, err := fileHash(filepath.Join(initPublic, "phase2-init.json"))
	if err != nil {
		t.Fatal(err)
	}
	parentDir, parentPin := initPublic, initialPin
	previousPath, previousPin := "", ""
	for i := range 2 {
		contributionDir := filepath.Join(dir, fmt.Sprintf("phase2-contribution-%d", i))
		options := Options{Operation: "phase2-contribute", Input: parentDir, InputPin: parentPin, Initialization: initPublic, InitializationPin: initialPin, Previous: previousPath, PreviousPin: previousPin}
		contributed, err := superviseConfigured(exe, contributionDir, 3, 20*time.Second, func() (uint64, error) { return 16 << 30, nil }, options)
		if err != nil || contributed.Status != "phase2-contribute-complete" {
			detail, _ := os.ReadFile(filepath.Join(contributionDir, "worker.txt"))
			t.Fatalf("phase2 contribute: %v %s", err, detail)
		}
		contributedPublic := filepath.Join(contributionDir, "public")
		artifactPin, err := fileHash(filepath.Join(contributedPublic, "artifact.json"))
		if err != nil {
			t.Fatal(err)
		}
		verifyDir := filepath.Join(dir, fmt.Sprintf("phase2-verified-%d", i))
		options.Operation = "phase2-verify"
		options.Input = contributedPublic
		options.InputPin = artifactPin
		options.Parent = parentDir
		options.ParentPin = parentPin
		verified, err := superviseConfigured(exe, verifyDir, 3, 20*time.Second, func() (uint64, error) { return 16 << 30, nil }, options)
		if err != nil || verified.Status != "phase2-verify-complete" {
			detail, _ := os.ReadFile(filepath.Join(verifyDir, "worker.txt"))
			t.Fatalf("phase2 verify: %v %s", err, detail)
		}

		// Re-pin a canonical transcript after changing its challenge: format/hash
		// integrity alone must never replace verification of the native transition.
		tamperedDir := filepath.Join(dir, fmt.Sprintf("phase2-tampered-%d", i))
		if err := os.Mkdir(tamperedDir, 0700); err != nil {
			t.Fatal(err)
		}
		body, err := os.ReadFile(filepath.Join(contributedPublic, "contribution.bin"))
		if err != nil {
			t.Fatal(err)
		}
		body[len(body)-1] ^= 1
		if err := os.WriteFile(filepath.Join(tamperedDir, "contribution.bin"), body, 0600); err != nil {
			t.Fatal(err)
		}
		var metadata Phase2Artifact
		originalMetadata, err := os.ReadFile(filepath.Join(contributedPublic, "artifact.json"))
		if err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(originalMetadata, &metadata); err != nil {
			t.Fatal(err)
		}
		metadata.SHA256, err = fileHash(filepath.Join(tamperedDir, "contribution.bin"))
		if err != nil {
			t.Fatal(err)
		}
		if err := exclusiveJSON(filepath.Join(tamperedDir, "artifact.json"), metadata); err != nil {
			t.Fatal(err)
		}
		badOptions := options
		badOptions.Input = tamperedDir
		badOptions.InputPin, err = fileHash(filepath.Join(tamperedDir, "artifact.json"))
		if err != nil {
			t.Fatal(err)
		}
		rejectedDir := filepath.Join(dir, fmt.Sprintf("phase2-rejected-%d", i))
		rejected, err := superviseConfigured(exe, rejectedDir, 3, 20*time.Second, func() (uint64, error) { return 16 << 30, nil }, badOptions)
		if err == nil || rejected.Status != "incomplete" || !rejected.Exited {
			t.Fatal("accepted re-pinned challenge substitution")
		}
		diagnostic, err := os.ReadFile(filepath.Join(rejectedDir, "worker.txt"))
		if err != nil || !strings.Contains(string(diagnostic), "challenge does not match") {
			t.Fatalf("tamper did not reach native transition verification: %v %s", err, diagnostic)
		}
		previousPath = filepath.Join(verifyDir, "public", "verification.json")
		previousPin, err = fileHash(previousPath)
		if err != nil {
			t.Fatal(err)
		}
		parentDir, parentPin = contributedPublic, artifactPin
	}

	keysDir := filepath.Join(dir, "phase2-keys")
	sealedKeys, err := superviseConfigured(exe, keysDir, 3, 20*time.Second, func() (uint64, error) { return 16 << 30, nil }, Options{Operation: "phase2-seal", Input: parentDir, InputPin: parentPin, Initialization: initPublic, InitializationPin: initialPin, Previous: previousPath, PreviousPin: previousPin, Commons: filepath.Join(sealedDir, "public"), CommonsPin: commonsPin, CS: csPath})
	if err != nil || sealedKeys.Status != "phase2-sealed" {
		detail, _ := os.ReadFile(filepath.Join(keysDir, "worker.txt"))
		t.Fatalf("phase2 seal: %v %s", err, detail)
	}
	pk, vk := groth16.NewProvingKey(ecc.BN254), groth16.NewVerifyingKey(ecc.BN254)
	for name, value := range map[string]io.ReaderFrom{"proving.key": pk, "verifying.key": vk} {
		raw, err := os.ReadFile(filepath.Join(keysDir, "public", name))
		if err != nil {
			t.Fatal(err)
		}
		if _, err = value.ReadFrom(bytes.NewReader(raw)); err != nil {
			t.Fatal(err)
		}
	}
	witness, err := frontend.NewWitness(&pipelineCircuit{X: 3, Y: 1853020188851841}, ecc.BN254.ScalarField())
	if err != nil {
		t.Fatal(err)
	}
	proof, err := groth16.Prove(compiled, pk, witness, solidity.WithProverTargetSolidityVerifier(backend.GROTH16))
	if err != nil {
		t.Fatal(err)
	}
	public, err := witness.Public()
	if err != nil {
		t.Fatal(err)
	}
	if err = groth16.Verify(proof, vk, public, solidity.WithVerifierTargetSolidityVerifier(backend.GROTH16)); err != nil {
		t.Fatal(err)
	}
	wrong, err := frontend.NewWitness(&pipelineCircuit{Y: 1853020188851840}, ecc.BN254.ScalarField(), frontend.PublicOnly())
	if err != nil {
		t.Fatal(err)
	}
	if err = groth16.Verify(proof, vk, wrong, solidity.WithVerifierTargetSolidityVerifier(backend.GROTH16)); err == nil {
		t.Fatal("substituted public input accepted")
	}
	before, err := os.ReadFile(filepath.Join(output, "report.json"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := supervise(exe, output, 3, time.Second, func() (uint64, error) { return 16 << 30, nil }); err == nil {
		t.Fatal("overwrote evidence")
	}
	after, _ := os.ReadFile(filepath.Join(output, "report.json"))
	if !bytes.Equal(before, after) {
		t.Fatal("evidence changed")
	}
}

func TestOriginalLaunchReceiptStrictness(t *testing.T) {
	dir := t.TempDir()
	value := map[string]any{"schema": "vendetta-unsafe-local-phase1-artifact-1", "operation": "first-contribution", "log2": 3, "bytes": 1801, "sha256": strings.Repeat("a", 64), "productionApproved": false}
	b, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "artifact.json")
	if err := os.WriteFile(path, b, 0600); err != nil {
		t.Fatal(err)
	}
	pin, err := fileHash(path)
	if err != nil {
		t.Fatal(err)
	}
	if a, err := sourceArtifact(dir, pin, 3); err != nil || a.ParentArtifactSHA256 != "" {
		t.Fatal("original launch format not preserved", err)
	}
	value["parentArtifactSha256"] = ""
	b, err = json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, b, 0600); err != nil {
		t.Fatal(err)
	}
	pin, err = fileHash(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := sourceArtifact(dir, pin, 3); err == nil {
		t.Fatal("mixed receipt schemas accepted")
	}
}

func TestFailureAndTimeoutReaped(t *testing.T) {
	for _, mode := range []string{"failure", "timeout", "headroom"} {
		t.Run(mode, func(t *testing.T) {
			dir := t.TempDir()
			exe := filepath.Join(dir, "helper")
			body := "#!/bin/sh\nexit 7\n"
			if mode == "timeout" {
				body = "#!/bin/sh\nsleep 30\n"
			}
			if err := os.WriteFile(exe, []byte(body), 0700); err != nil {
				t.Fatal(err)
			}
			mem := uint64(16 << 30)
			if mode == "headroom" {
				mem = 1 << 30
			}
			r, err := supervise(exe, filepath.Join(dir, "run"), 3, 100*time.Millisecond, func() (uint64, error) { return mem, nil })
			if err == nil || r.Status != "incomplete" {
				t.Fatal("failure accepted")
			}
			if mode != "headroom" && !r.Exited {
				t.Fatal("failed process not reaped")
			}
			if mode == "headroom" && r.PID != 0 {
				t.Fatal("worker started without headroom")
			}
			var stored Report
			b, err := os.ReadFile(filepath.Join(dir, "run", "report.json"))
			if err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(b, &stored); err != nil || stored.Failure == "" {
				t.Fatal("missing failure evidence")
			}
		})
	}
}

func TestBounds(t *testing.T) {
	for _, args := range [][]string{{"contribute", "--log2", "22"}, {"worker", "--log2", "24", "--unsafe-test-only"}, {"contribute", "--log2", "16", "--unsafe-test-only"}} {
		if err := run(args, io.Discard); err == nil {
			t.Fatal("invalid command accepted")
		}
	}
}

func TestPhase2MemoryPressureReapsWorker(t *testing.T) {
	for _, operation := range []string{"phase2-init", "verify", "phase2-contribute", "phase2-verify", "phase2-seal"} {
		t.Run(operation, func(t *testing.T) {
			dir := t.TempDir()
			exe := filepath.Join(dir, "waiting-worker")
			if err := os.WriteFile(exe, []byte("#!/bin/sh\nsleep 30\n"), 0700); err != nil {
				t.Fatal(err)
			}
			calls := 0
			report, err := superviseConfigured(exe, filepath.Join(dir, "run"), 3, 5*time.Second, func() (uint64, error) {
				calls++
				if calls == 1 {
					return 16 << 30, nil
				}
				return 3 << 30, nil
			}, Options{Operation: operation})
			if err == nil || !report.Exited || report.Failure != "host-memory-pressure" || report.WallMilliseconds > 3000 {
				t.Fatalf("worker survived memory-pressure stop: %+v %v", report, err)
			}
			if _, err := os.Stat(fmt.Sprintf("/proc/%d", report.PID)); !os.IsNotExist(err) {
				t.Fatal("worker was not reaped")
			}
		})
	}
}

func TestVerificationRequiresExtraHostHeadroom(t *testing.T) {
	dir := t.TempDir()
	exe := filepath.Join(dir, "must-not-start")
	if err := os.WriteFile(exe, []byte("#!/bin/sh\nexit 7\n"), 0700); err != nil {
		t.Fatal(err)
	}
	report, err := superviseConfigured(exe, filepath.Join(dir, "run"), 3, time.Second, func() (uint64, error) { return 14 << 30, nil }, Options{Operation: "verify"})
	if err == nil || report.PID != 0 || report.Exited || report.AddressSpaceBytes != 14<<30 {
		t.Fatalf("verification started without its host margin: %+v %v", report, err)
	}
}

func TestMemoryStopReason(t *testing.T) {
	for _, tc := range []struct {
		name            string
		rss, available  uint64
		rssErr, hostErr error
		want            string
	}{
		{"healthy", 8 << 30, 5 << 30, nil, nil, ""},
		{"host-pressure-below-worker-budget", 8 << 30, 3 << 30, nil, nil, "host-memory-pressure"},
		{"worker-budget", 11 << 30, 5 << 30, nil, nil, "sampled-memory-budget-exceeded"},
		{"host-observation", 8 << 30, 0, nil, io.EOF, "host-memory-observation-unavailable"},
		{"worker-disappeared", 0, 5 << 30, os.ErrNotExist, nil, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := memoryStopReason(tc.rss, tc.rssErr, tc.available, tc.hostErr); got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestPressureCauseSurvivesLaterObservationFailure(t *testing.T) {
	var failure string
	rememberFailure(&failure, "host-memory-pressure")
	rememberFailure(&failure, "rss-observation-unavailable")
	rememberFailure(&failure, "heartbeat-write-failed")
	if failure != "host-memory-pressure" {
		t.Fatalf("lost stop cause: %q", failure)
	}
}

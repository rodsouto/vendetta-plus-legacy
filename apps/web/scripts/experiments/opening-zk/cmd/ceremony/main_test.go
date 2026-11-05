package main

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"testing"
	"time"

	"vendetta-opening-pairing-experiment/ceremony"
)

func cliFixture(t *testing.T) (string, []byte, []byte, []byte, time.Time) {
	t.Helper()
	marshal := func(v any) []byte {
		b, err := json.Marshal(v)
		if err != nil {
			t.Fatal(err)
		}
		return b
	}
	plan := marshal(ceremony.Plan{
		Schema: "vendetta-hidden-v2-ceremony-plan-1", CeremonyID: "cli-test",
		SourceBundleSHA256: strings.Repeat("a", 64),
		Backend:            ceremony.Backend{Curve: "BN254", GnarkVersion: "v0.16.4", GnarkCommit: "e974abb44722dd201a7f1949baeabca0fef5866e"},
		Phase1Policy:       "separate-per-circuit", BeaconPolicy: "authenticate-after-phase-close",
		Participants: []string{"participant-a", "participant-b"},
		Circuits: []ceremony.Circuit{
			{Kind: "opening", SHA256: strings.Repeat("b", 64), Constraints: 5139537, PublicInputs: 55, DomainSize: 1 << 23},
			{Kind: "invalid-point", SHA256: strings.Repeat("c", 64), Constraints: 3760005, PublicInputs: 2, DomainSize: 1 << 22},
		},
	})
	trust := ceremony.Trust{Schema: "vendetta-hidden-v2-review-trust-1", ExpiresAt: "2026-11-03T00:00:00Z", Threshold: 2}
	var private []ed25519.PrivateKey
	for _, id := range []string{"reviewer-a", "reviewer-b"} {
		pub, key, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			t.Fatal(err)
		}
		trust.Reviewers = append(trust.Reviewers, ceremony.Reviewer{ID: id, PublicKey: hex.EncodeToString(pub)})
		private = append(private, key)
	}
	trustBytes := marshal(trust)
	payload := marshal(ceremony.Review{
		Schema: "vendetta-hidden-v2-design-review-1", CeremonyID: "cli-test",
		PlanSHA256: ceremony.Digest(plan), TrustSHA256: ceremony.Digest(trustBytes), Purpose: "design-review-only",
		ReviewedAt: "2026-10-31T00:00:00Z", ExpiresAt: "2026-11-02T00:00:00Z",
	})
	envelope := ceremony.Envelope{Payload: base64.StdEncoding.EncodeToString(payload)}
	for i, key := range private {
		envelope.Signatures = append(envelope.Signatures, ceremony.Signature{
			ReviewerID: trust.Reviewers[i].ID,
			Signature:  hex.EncodeToString(ed25519.Sign(key, append([]byte(ceremony.ReviewDomain), payload...))),
		})
	}
	review := marshal(envelope)
	dir := t.TempDir()
	for name, data := range map[string][]byte{"plan.json": plan, "trust.json": trustBytes, "review.json": review} {
		if err := os.WriteFile(filepath.Join(dir, name), data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	return dir, plan, trustBytes, review, time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)
}

func TestCLIDesignCommands(t *testing.T) {
	dir, plan, trust, _, now := cliFixture(t)
	base := []string{"--plan", filepath.Join(dir, "plan.json"), "--plan-sha256", ceremony.Digest(plan)}
	for _, command := range []string{"inspect-plan", "verify-review"} {
		t.Run(command, func(t *testing.T) {
			args := append([]string{command}, base...)
			if command == "verify-review" {
				args = append(args, "--trust", filepath.Join(dir, "trust.json"), "--trust-sha256", ceremony.Digest(trust),
					"--review", filepath.Join(dir, "review.json"))
			}
			var output bytes.Buffer
			if err := run(args, &output, now); err != nil {
				t.Fatal(err)
			}
			var result map[string]any
			if err := json.Unmarshal(output.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			for _, field := range []string{"productionApproved", "mpcTranscriptVerified", "artifactBytesVerified"} {
				if value, ok := result[field]; !ok || value != false {
					t.Fatalf("command claims evidence it did not establish: %s", field)
				}
			}
		})
	}
	for _, args := range [][]string{
		{}, {"contribute"}, {"inspect-plan", "--plan", filepath.Join(dir, "plan.json")},
		append(append([]string{"inspect-plan"}, base...), "extra"),
		append(append([]string{"inspect-plan"}, base...), "--unsafe-enable-production"),
		append([]string{"verify-review"}, base...),
	} {
		var output bytes.Buffer
		if err := run(args, &output, now); err == nil || output.Len() != 0 {
			t.Fatalf("invalid command accepted or emitted a success record: %v", args)
		}
	}
}

func TestCLIReadLimitsAndSpecialFiles(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "oversized.json")
	if err := os.WriteFile(file, make([]byte, ceremony.MaxDocumentBytes+1), 0600); err != nil {
		t.Fatal(err)
	}
	link, fifo := filepath.Join(dir, "link.json"), filepath.Join(dir, "fifo")
	if err := os.Symlink(file, link); err != nil {
		t.Fatal(err)
	}
	if err := syscall.Mkfifo(fifo, 0600); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{file, link, fifo, dir, ""} {
		if _, err := read(path); err == nil {
			t.Fatalf("invalid input accepted: %s", path)
		}
	}
}

func TestShellWrapperRelativePaths(t *testing.T) {
	dir, plan, _, _, _ := cliFixture(t)
	root, err := exec.Command("git", "rev-parse", "--show-toplevel").Output()
	if err != nil {
		t.Fatal(err)
	}
	script := filepath.Join(strings.TrimSpace(string(root)), "scripts/hidden-v2-ceremony.sh")
	for _, pathFlag := range [][]string{{"--plan", "plan.json"}, {"--plan=plan.json"}, {"-plan", "plan.json"}, {"-plan=plan.json"}} {
		args := append([]string{script, "inspect-plan"}, pathFlag...)
		args = append(args, "--plan-sha256", ceremony.Digest(plan))
		cmd := exec.Command("bash", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(), "VENDETTA_GO_BIN="+filepath.Join(runtime.GOROOT(), "bin/go"), "INIT_CWD="+dir)
		out, err := cmd.CombinedOutput()
		if err != nil || !bytes.Contains(out, []byte(`"status":"design-plan-validated"`)) {
			t.Fatalf("relative-path invocation failed: %v %s", err, out)
		}
	}
}

func TestCLIExecution(t *testing.T) {
	dir, plan, _, _, now := cliFixture(t)
	e := ceremony.Execution{
		Schema: "vendetta-hidden-v2-execution-plan-1", PlanSHA256: ceremony.Digest(plan),
		Participants: []ceremony.Reviewer{}, Resources: ceremony.Resources{MemoryBytes: 1 << 30, TranscriptBytes: 1 << 20, StorageBytes: 1 << 24, WallSeconds: 3600, CPUCount: 2},
	}
	for _, id := range []string{"participant-a", "participant-b"} {
		pub, _, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			t.Fatal(err)
		}
		e.Participants = append(e.Participants, ceremony.Reviewer{ID: id, PublicKey: hex.EncodeToString(pub)})
	}
	for _, kind := range []string{"opening", "invalid-point"} {
		for phase := 1; phase <= 2; phase++ {
			day := "01"
			if phase == 2 {
				day = "02"
			}
			e.Phases = append(e.Phases, ceremony.Phase{Circuit: kind, Phase: uint64(phase), OpensAt: "2026-11-" + day + "T00:00:00Z", ClosesAt: "2026-11-" + day + "T01:00:00Z", BeaconNotBefore: "2026-11-" + day + "T02:00:00Z", BeaconDeadline: "2026-11-" + day + "T03:00:00Z", BeaconPolicySHA256: strings.Repeat("d", 64), ClosurePolicySHA256: strings.Repeat("e", 64)})
		}
	}
	data, err := json.Marshal(e)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "execution.json")
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	args := []string{"inspect-execution", "--plan", filepath.Join(dir, "plan.json"), "--plan-sha256", ceremony.Digest(plan), "--execution", path, "--execution-sha256", ceremony.Digest(data)}
	var output bytes.Buffer
	if err := run(args, &output, now); err != nil {
		t.Fatal(err)
	}
	var result map[string]any
	if err := json.Unmarshal(output.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result["status"] != "execution-proposal-validated" {
		t.Fatal(result)
	}
	for _, field := range []string{"productionApproved", "mpcTranscriptVerified", "artifactBytesVerified", "participantIdentitiesAuthenticated", "beaconEvidenceAuthenticated", "resourceLimitsEnforced"} {
		if result[field] != false {
			t.Fatalf("unexpected evidence: %s", field)
		}
	}
	args[len(args)-1] = strings.Repeat("0", 64)
	output.Reset()
	if err := run(args, &output, now); err == nil || output.Len() != 0 {
		t.Fatal("invalid pin produced success")
	}
}

func TestPnpmWrapperRelativePaths(t *testing.T) {
	dir, plan, _, _, _ := cliFixture(t)
	root, err := exec.Command("git", "rev-parse", "--show-toplevel").Output()
	if err != nil {
		t.Fatal(err)
	}
	caller := filepath.Join(strings.TrimSpace(string(root)), "apps", "web")
	relative, err := filepath.Rel(caller, filepath.Join(dir, "plan.json"))
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("pnpm", "--workspace-root", "ceremony:hidden-v2", "inspect-plan", "--plan="+relative, "--plan-sha256", ceremony.Digest(plan))
	cmd.Dir = caller
	// pnpm must supply INIT_CWD itself: exercise the actual package command.
	env := []string{}
	for _, entry := range os.Environ() {
		if !strings.HasPrefix(entry, "INIT_CWD=") {
			env = append(env, entry)
		}
	}
	cmd.Env = append(env, "VENDETTA_GO_BIN="+filepath.Join(runtime.GOROOT(), "bin/go"))
	out, err := cmd.CombinedOutput()
	if err != nil || !bytes.Contains(out, []byte(`"status":"design-plan-validated"`)) {
		t.Fatalf("pnpm relative paths: %v %s", err, out)
	}
}

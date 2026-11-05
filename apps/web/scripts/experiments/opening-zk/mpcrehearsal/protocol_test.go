package mpcrehearsal

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"vendetta-opening-pairing-experiment/ceremony"
)

type testRun struct{ dir, pin, parent, closure2 string }

func initialRun(t *testing.T) testRun {
	t.Helper()
	r := testRun{dir: filepath.Join(t.TempDir(), "run")}
	var err error
	r.pin, err = Initialize(r.dir)
	if err != nil {
		t.Fatal(err)
	}
	return r
}
func fullRun(t *testing.T) testRun {
	t.Helper()
	r := initialRun(t)
	for phase := 1; phase <= 2; phase++ {
		for i, id := range []string{"participant-a", "participant-b"} {
			if err := Contribute(r.dir, r.pin, r.parent, filepath.Join(r.dir, id+"-test-identity.json"), phase, i); err != nil {
				t.Fatal(err)
			}
		}
		pin, err := Close(r.dir, r.pin, r.parent, phase)
		if err != nil {
			t.Fatal(err)
		}
		if phase == 1 {
			r.parent = pin
		} else {
			r.closure2 = pin
		}
	}
	return r
}
func TestProtocolRehearsal(t *testing.T) {
	r := fullRun(t)
	report, err := Verify(r.dir, r.pin, r.parent, r.closure2)
	if err != nil {
		t.Fatal(err)
	}
	if !report.GuardedNativeDecoding || !report.NativeTranscriptVerified || !report.ContributionSignaturesVerified || !report.BeaconSignaturesAuthenticated || !report.ProofVerified || !report.ExtractionReproduced || !report.WrongPublicInputRejected {
		t.Fatal("missing rehearsal evidence")
	}
	if report.ProductionApproved || report.IndependentParticipants || report.BeaconAfterClosureProven {
		t.Fatal("rehearsal incorrectly claims production evidence")
	}
	cfg, err := readFile(filepath.Join(r.dir, "config.json"))
	if err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(filepath.Join(r.dir, "participant-a-test-identity.json"))
	if err != nil || info.Mode().Perm() != 0600 {
		t.Fatal("test identity permissions")
	}
	if _, err := Initialize(r.dir); err == nil {
		t.Fatal("existing run overwritten")
	}
	after, _ := readFile(filepath.Join(r.dir, "config.json"))
	if string(cfg) != string(after) {
		t.Fatal("overwrite changed configuration")
	}
	if _, err := Verify(r.dir, r.pin, r.parent, r.closure2); err == nil {
		t.Fatal("existing report overwritten")
	}
}
func TestProtocolAdversaries(t *testing.T) {
	r := fullRun(t)
	// Each subtest restores the same valid files. Failed verification must not
	// publish verification.json. Mutated closures receive a matching supplied pin,
	// so their semantic checks, rather than only hash mismatch, must reject them.
	files := map[string][]byte{}
	entries, err := os.ReadDir(r.dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		raw, err := os.ReadFile(filepath.Join(r.dir, e.Name()))
		if err != nil {
			t.Fatal(err)
		}
		files[e.Name()] = raw
	}
	restore := func() {
		for name, raw := range files {
			if err := os.WriteFile(filepath.Join(r.dir, name), raw, 0600); err != nil {
				t.Fatal(err)
			}
		}
	}
	put := func(name string, v any) string {
		raw, err := json.Marshal(v)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(r.dir, name), raw, 0600); err != nil {
			t.Fatal(err)
		}
		return ceremony.Digest(raw)
	}
	resignNative := func(phase int, mutate func([]byte)) {
		name := artifactName(phase, 0)
		var a Artifact
		if err := json.Unmarshal(files[name], &a); err != nil {
			t.Fatal(err)
		}
		data, err := canonicalBase64(a.Transcript)
		if err != nil {
			t.Fatal(err)
		}
		mutate(data)
		a.Transcript = base64.StdEncoding.EncodeToString(data)
		payload, err := canonicalBase64(a.Payload)
		if err != nil {
			t.Fatal(err)
		}
		var s Statement
		if err := json.Unmarshal(payload, &s); err != nil {
			t.Fatal(err)
		}
		s.NativeSHA256 = ceremony.Digest(data)
		payload, err = json.Marshal(s)
		if err != nil {
			t.Fatal(err)
		}
		a.Payload = base64.StdEncoding.EncodeToString(payload)
		var id identity
		if err := json.Unmarshal(files["participant-a-test-identity.json"], &id); err != nil {
			t.Fatal(err)
		}
		seed, _ := hex.DecodeString(id.Seed)
		a.Signature = hex.EncodeToString(ed25519.Sign(ed25519.NewKeyFromSeed(seed), append([]byte(contributionDomain), payload...)))
		put(name, a)
	}
	cases := map[string]struct {
		want   string
		mutate func(*testRun)
	}{
		"missing": {"no such file", func(r *testRun) {
			if err := os.Remove(filepath.Join(r.dir, artifactName(1, 1))); err != nil {
				t.Fatal(err)
			}
		}},
		"reordered": {"chain/context", func(r *testRun) {
			if err := os.WriteFile(filepath.Join(r.dir, artifactName(1, 0)), files[artifactName(1, 1)], 0600); err != nil {
				t.Fatal(err)
			}
		}},
		"wrong-config-pin":            {"external pin", func(r *testRun) { r.pin = zeroHash }},
		"wrong-closure-pin":           {"closure does not match", func(r *testRun) { r.parent = zeroHash }},
		"wrong-phase-two-closure-pin": {"closure does not match", func(r *testRun) { r.closure2 = zeroHash }},
		"empty-closure": {"incomplete", func(r *testRun) {
			var cl Closure
			json.Unmarshal(files[closureName(1)], &cl)
			cl.ArtifactSHA256 = []string{}
			r.parent = put(closureName(1), cl)
		}},
		"reordered-closure": {"reorders", func(r *testRun) {
			var cl Closure
			json.Unmarshal(files[closureName(1)], &cl)
			cl.ArtifactSHA256[0], cl.ArtifactSHA256[1] = cl.ArtifactSHA256[1], cl.ArtifactSHA256[0]
			r.parent = put(closureName(1), cl)
		}},
		"cross-phase-closure": {"incomplete", func(r *testRun) {
			var cl Closure
			json.Unmarshal(files[closureName(2)], &cl)
			cl.Phase = 1
			r.closure2 = put(closureName(2), cl)
		}},
		"cross-run-attestation": {"chain/context", func(r *testRun) {
			var a Artifact
			json.Unmarshal(files[artifactName(1, 0)], &a)
			p, _ := canonicalBase64(a.Payload)
			var s Statement
			json.Unmarshal(p, &s)
			s.RunID = strings.Repeat("f", 32)
			p, _ = json.Marshal(s)
			a.Payload = base64.StdEncoding.EncodeToString(p)
			put(artifactName(1, 0), a)
		}},
		"forged-attestation": {"invalid contribution attestation", func(r *testRun) {
			var a Artifact
			json.Unmarshal(files[artifactName(1, 0)], &a)
			a.Signature = strings.Repeat("00", 64)
			put(artifactName(1, 0), a)
		}},
		"signed-domain-bomb": {"native phase one domain", func(r *testRun) {
			resignNative(1, func(b []byte) { binary.BigEndian.PutUint64(b[288:296], ^uint64(0)) })
		}},
		"signed-commitment-bomb": {"native commitment count", func(r *testRun) { resignNative(2, func(b []byte) { binary.BigEndian.PutUint16(b[:2], 65535) }) }},
		"signed-vector-bomb":     {"native vector length", func(r *testRun) { resignNative(2, func(b []byte) { binary.BigEndian.PutUint32(b[34:38], ^uint32(0)) }) }},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			restore()
			copy := r
			tc.mutate(&copy)
			_, err := Verify(copy.dir, copy.pin, copy.parent, copy.closure2)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("expected %q, got %v", tc.want, err)
			}
			if _, err := os.Stat(filepath.Join(r.dir, "verification.json")); !os.IsNotExist(err) {
				t.Fatal("failed verification published report")
			}
		})
	}
	restore()
}
func TestAdmissionAndIncompleteHistory(t *testing.T) {
	r := initialRun(t)
	if _, err := Close(r.dir, r.pin, "", 1); err == nil {
		t.Fatal("empty history closed")
	}
	// Wrong key cannot emit a contribution. Corrupt history cannot be extended.
	if err := Contribute(r.dir, r.pin, "", filepath.Join(r.dir, "participant-b-test-identity.json"), 1, 0); err == nil {
		t.Fatal("wrong signer admitted")
	}
	if _, err := os.Stat(filepath.Join(r.dir, artifactName(1, 0))); !os.IsNotExist(err) {
		t.Fatal("wrong signer produced artifact")
	}
	if err := Contribute(r.dir, r.pin, "", filepath.Join(r.dir, "participant-a-test-identity.json"), 1, 0); err != nil {
		t.Fatal(err)
	}
	if err := Contribute(r.dir, r.pin, "", filepath.Join(r.dir, "participant-a-test-identity.json"), 1, 0); err == nil {
		t.Fatal("contribution overwritten")
	}
	if _, err := Close(r.dir, r.pin, "", 1); err == nil {
		t.Fatal("truncated history closed")
	}
	path := filepath.Join(r.dir, artifactName(1, 0))
	if err := os.WriteFile(path, []byte(`{}`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := Contribute(r.dir, r.pin, "", filepath.Join(r.dir, "participant-b-test-identity.json"), 1, 1); err == nil {
		t.Fatal("corrupt chain extended")
	}
	if _, err := os.Stat(filepath.Join(r.dir, artifactName(1, 1))); !os.IsNotExist(err) {
		t.Fatal("corrupt chain produced next contribution")
	}
	if _, err := Initialize(filepath.Join(".", "inside-git")); err == nil {
		t.Fatal("relative output accepted")
	}
}

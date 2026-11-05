package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestProducerNativeWitness(t *testing.T) {
	data, e := os.ReadFile(filepath.Join(filepath.Dir(ageInputPath()), "codec-v2", "vectors.json"))
	if e != nil {
		t.Fatal(e)
	}
	var file struct {
		Vectors []struct{ Name, ABI, Statement, Packet, Signature, Expected, RawPlain string }
	}
	if e = json.Unmarshal(data, &file); e != nil {
		t.Fatal(e)
	}
	for _, v := range file.Vectors {
		t.Run(v.Name, func(t *testing.T) {
			out, e := prepareProducer(producerRequest{ABI: v.ABI, Statement: v.Statement, Packet: v.Packet, Signature: v.Signature})
			if e != nil {
				t.Fatal(e)
			}
			if out.Kind != "opening" || out.Valid != (v.Expected == "valid") {
				t.Fatalf("unexpected native result: %s %v", out.Kind, out.Valid)
			}
			if hex.EncodeToString(out.Plain) != v.RawPlain {
				t.Fatal("plaintext derivation differs")
			}
			bad := producerRequest{ABI: v.ABI, Statement: v.Statement, Packet: v.Packet, Signature: "00"}
			if o, e := prepareProducer(bad); e == nil || o.Pre != "" {
				t.Fatal("unauthenticated beacon produced a witness/pre")
			}
		})
	}
	v := file.Vectors[0]
	t.Run("authentic-signature-wrong-round", func(t *testing.T) {
		beacon := readBeaconVectors(t)[1]
		if beacon.Round != "1001" || !beacon.Expected {
			t.Fatal("expected authentic round 1001 fixture")
		}
		out, err := prepareProducer(producerRequest{ABI: v.ABI, Statement: v.Statement, Packet: v.Packet, Signature: beacon.Signature})
		if err == nil || err.Error() != "beacon authentication failed" || out.Assignment != nil || out.Pre != "" {
			t.Fatalf("wrong-round beacon produced witness: %v", err)
		}
	})
	p, _ := producerDecodeHex(v.Packet)
	p[44] &= 127
	a, _ := producerDecodeHex(v.ABI)
	copy(a[608:], nativeKeccak(p))
	root := nativeKeccak(a)
	out, e := prepareProducer(producerRequest{ABI: "0x" + hex.EncodeToString(a), Statement: "0x" + hex.EncodeToString(root), Packet: hex.EncodeToString(p)})
	if e != nil || out.Kind != "invalid-point" || out.Pre != "" {
		t.Fatal("invalid-U route must not depend on a beacon", e)
	}
	if _, e = prepareProducer(producerRequest{ABI: v.ABI, Statement: v.Statement, Packet: hex.EncodeToString(p)}); e == nil {
		t.Fatal("changed packet accepted against original root")
	}
	a, _ = producerDecodeHex(v.ABI)
	a[287] = 20
	root = nativeKeccak(a)
	out, e = prepareProducer(producerRequest{ABI: "0x" + hex.EncodeToString(a), Statement: "0x" + hex.EncodeToString(root), Packet: v.Packet, Signature: v.Signature})
	if e != nil {
		t.Fatal(e)
	}
	if out.Assignment.(*MissionV2Circuit).FromRow.(*big.Int).String() != "1" {
		t.Fatal("source row not derived")
	}
}

func producerMustPanic(t *testing.T, message string, run func()) {
	t.Helper()
	defer func() {
		if got := recover(); got == nil || !strings.Contains(fmt.Sprint(got), message) {
			t.Fatalf("expected panic containing %q, got %v", message, got)
		}
	}()
	run()
}

func TestProducerSetupNeverOverwrites(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "existing")
	if err := os.Mkdir(dir, 0700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "proving.key")
	if err := os.WriteFile(path, []byte("preserved"), 0600); err != nil {
		t.Fatal(err)
	}
	producerMustPanic(t, "file exists", func() { producerSetup("opening", dir) })
	data, err := os.ReadFile(path)
	if err != nil || string(data) != "preserved" {
		t.Fatal("existing setup changed", err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 {
		t.Fatal("existing setup directory changed", err)
	}
}

func TestProducerArtifactIntegrity(t *testing.T) {
	for _, name := range []string{"circuit.bin", "proving.key", "verifying.key", "Verifier.sol"} {
		t.Run(name, func(t *testing.T) {
			dir := t.TempDir()
			hashes := map[string]string{}
			for _, artifact := range []string{"circuit.bin", "proving.key", "verifying.key", "Verifier.sol"} {
				data := []byte(artifact)
				if err := os.WriteFile(filepath.Join(dir, artifact), data, 0600); err != nil {
					t.Fatal(err)
				}
				hashes[artifact] = fmt.Sprintf("%x", sha256.Sum256(data))
			}
			writeProducerJSON(filepath.Join(dir, "manifest.json"), map[string]any{"kind": "opening", "profile": "VENDETTA_OPENING_V2", "sha256": hashes})
			// Intact bytes reach request loading, without decoding fake keys or compiling a circuit.
			producerMustPanic(t, "no such file", func() { producerProve(dir, filepath.Join(dir, "missing-request"), "unused") })
			if err := os.WriteFile(filepath.Join(dir, name), []byte("tampered"), 0600); err != nil {
				t.Fatal(err)
			}
			producerMustPanic(t, "artifact integrity failure", func() { producerProve(dir, "unused", "unused") })
			manifest := mustRead(filepath.Join(dir, "manifest.json"))
			state := &producerArtifacts{digest: fmt.Sprintf("%x", sha256.Sum256(manifest))}
			producerMustPanic(t, "artifact integrity failure", func() { producerProveWithArtifacts(dir, "unused", "unused", state) })
			delete(hashes, name)
			writeProducerJSON(filepath.Join(dir, "manifest.json"), map[string]any{"profile": "VENDETTA_OPENING_V2", "sha256": hashes})
			producerMustPanic(t, "incomplete artifact manifest", func() { producerProve(dir, "unused", "unused") })
		})
	}
}

func TestProducerProfile(t *testing.T) {
	start := time.Now()
	p := &producerProfile{last: start, Stages: make(map[string]float64)}
	p.markAt("integrityMs", start.Add(1500*time.Microsecond))
	p.markAt("proveMs", start.Add(4*time.Millisecond))
	if p.Stages["integrityMs"] != 1.5 || p.Stages["proveMs"] != 2.5 || len(p.Stages) != 2 {
		t.Fatalf("phase durations must be disjoint and retain sub-millisecond precision: %v", p.Stages)
	}
}

func TestProducerWorkerProtocol(t *testing.T) {
	var output bytes.Buffer
	producerWorker("unused", strings.NewReader(""), &output)
	if output.Len() != 0 {
		t.Fatal("empty worker must not acknowledge a job")
	}
	for _, tc := range []struct{ name, input, message string }{
		{"json", "{\n", "unexpected end"},
		{"missing-path", "{}\n", "invalid worker job"},
		{"missing-id", `{"input":"unused","output":"unused"}` + "\n", "invalid worker job"},
		{"injected-id", `{"id":"bad\nmarker","input":"unused","output":"unused"}` + "\n", "invalid worker job"},
		{"oversized", strings.Repeat("x", 65537), "token too long"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			producerMustPanic(t, tc.message, func() { producerWorker("unused", strings.NewReader(tc.input), &out) })
			if out.Len() != 0 {
				t.Fatal("failed job acknowledged")
			}
		})
	}
}

func TestProducerWorkerPinsSetupManifest(t *testing.T) {
	dir := t.TempDir()
	writeProducerJSON(filepath.Join(dir, "manifest.json"), map[string]any{"profile": "VENDETTA_OPENING_V2", "kind": "opening"})
	state := &producerArtifacts{digest: "previous-manifest-digest"}
	producerMustPanic(t, "worker setup changed", func() {
		producerProveWithArtifacts(dir, "unused", "unused", state)
	})
}

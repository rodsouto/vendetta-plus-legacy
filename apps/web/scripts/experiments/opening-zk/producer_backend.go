package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"time"

	"github.com/consensys/gnark-crypto/ecc"
	bls "github.com/consensys/gnark-crypto/ecc/bls12-381"
	fr "github.com/consensys/gnark-crypto/ecc/bn254/fr"
	"github.com/consensys/gnark/backend"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/backend/solidity"
	"github.com/consensys/gnark/constraint"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

func producerShape(kind string) frontend.Circuit {
	if kind == "opening" {
		return &MissionV2Circuit{Opening: AuthenticatedOpeningCircuit{Opening: CapsuleAgeCircuit{Age: *ageShape(290, 37), RoundDecimal: make([]frontend.Variable, 16), CodecV2: true}}}
	}
	if kind == "invalid-point" {
		return &InvalidPointMissionV2Circuit{}
	}
	panic("unsupported circuit")
}
func writeProducerJSON(path string, v any) {
	b, e := json.MarshalIndent(v, "", "  ")
	check(e)
	tmp := path + ".tmp"
	check(os.WriteFile(tmp, append(b, '\n'), 0600))
	check(os.Rename(tmp, path))
}
func writeProducerArtifact(path string, v io.WriterTo) {
	f, e := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	check(e)
	_, e = v.WriteTo(f)
	check(e)
	check(f.Close())
}
func readProducerArtifact(path string, v io.ReaderFrom) {
	f, e := os.Open(path)
	check(e)
	defer f.Close()
	_, e = v.ReadFrom(f)
	check(e)
}
func producerSetup(kind, dir string) {
	// Never overwrite a key set. Partial output has no manifest and is not loadable.
	check(os.Mkdir(dir, 0700))
	fmt.Println("stage: compile", kind)
	cs, e := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, producerShape(kind))
	check(e)
	fmt.Println("stage: unsafe local setup", kind)
	pk, vk, e := groth16.Setup(cs)
	check(e)
	fmt.Println("stage: persist", kind)
	writeProducerArtifact(filepath.Join(dir, "circuit.bin"), cs)
	writeProducerArtifact(filepath.Join(dir, "proving.key"), pk)
	writeProducerArtifact(filepath.Join(dir, "verifying.key"), vk)
	f, e := os.Create(filepath.Join(dir, "Verifier.sol"))
	check(e)
	check(vk.ExportSolidity(f))
	check(f.Close())
	hashes := map[string]string{}
	for _, name := range []string{"circuit.bin", "proving.key", "verifying.key", "Verifier.sol"} {
		f, e := os.Open(filepath.Join(dir, name))
		check(e)
		h := sha256.New()
		_, e = io.Copy(h, f)
		check(e)
		check(f.Close())
		hashes[name] = hex.EncodeToString(h.Sum(nil))
	}
	writeProducerJSON(filepath.Join(dir, "manifest.json"), map[string]any{"kind": kind, "profile": "VENDETTA_OPENING_V2", "unsafeLocalSetup": true, "constraints": cs.GetNbConstraints(), "publicInputs": cs.GetNbPublicVariables() - 1, "sha256": hashes})
	fmt.Println("stage: ready", kind)
}

// Timings use a monotonic clock and contain only aggregate durations, never witness data.
// They do not alter the circuit, setup or public inputs.
type producerProfile struct {
	last   time.Time
	Stages map[string]float64
}

func newProducerProfile() *producerProfile {
	return &producerProfile{last: time.Now(), Stages: make(map[string]float64)}
}
func (p *producerProfile) mark(name string) {
	p.markAt(name, time.Now())
}
func (p *producerProfile) markAt(name string, now time.Time) {
	p.Stages[name] = float64(now.Sub(p.last)) / float64(time.Millisecond)
	p.last = now
}

type producerArtifacts struct {
	cs     constraint.ConstraintSystem
	pk     groth16.ProvingKey
	vk     groth16.VerifyingKey
	digest string
}

func producerProve(dir, input, output string) {
	producerProveWithArtifacts(dir, input, output, &producerArtifacts{})
}

// One fixed setup per process. Any request failure terminates the worker; callers
// must wait for exit before retrying or switching circuits in a new process.
func producerWorker(dir string, input io.Reader, output io.Writer) {
	scanner := bufio.NewScanner(input)
	scanner.Buffer(make([]byte, 4096), 64*1024)
	artifacts := &producerArtifacts{}
	for scanner.Scan() {
		var job struct{ ID, Input, Output string }
		check(json.Unmarshal(scanner.Bytes(), &job))
		if job.Input == "" || job.Output == "" || !regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`).MatchString(job.ID) {
			panic("invalid worker job")
		}
		producerProveWithArtifacts(dir, job.Input, job.Output, artifacts)
		_, e := fmt.Fprintln(output, "VENDETTA_WORKER_V2_DONE", job.ID)
		check(e)
	}
	check(scanner.Err())
}

func producerProveWithArtifacts(dir, input, output string, artifacts *producerArtifacts) {
	start := time.Now()
	profile := newProducerProfile()
	b, e := os.ReadFile(filepath.Join(dir, "manifest.json"))
	check(e)
	var manifest struct {
		Kind, Profile string
		SHA256        map[string]string
	}
	check(json.Unmarshal(b, &manifest))
	if manifest.Profile != "VENDETTA_OPENING_V2" {
		panic("wrong profile")
	}
	manifestDigest := fmt.Sprintf("%x", sha256.Sum256(b))
	if artifacts.digest != "" && artifacts.digest != manifestDigest {
		panic("worker setup changed")
	}
	// Verify persisted bytes before decoding them. Keys are trusted local setup artifacts, not requests.
	if len(manifest.SHA256) != 4 {
		panic("incomplete artifact manifest")
	}
	for _, name := range []string{"circuit.bin", "proving.key", "verifying.key", "Verifier.sol"} {
		want := manifest.SHA256[name]
		if len(want) != 64 {
			panic("incomplete artifact hash")
		}
		if filepath.Base(name) != name {
			panic("invalid artifact name")
		}
		f, e := os.Open(filepath.Join(dir, name))
		check(e)
		h := sha256.New()
		_, e = io.Copy(h, f)
		check(e)
		check(f.Close())
		if hex.EncodeToString(h.Sum(nil)) != want {
			panic("artifact integrity failure")
		}
	}
	profile.mark("artifactIntegrityMs")
	b, e = os.ReadFile(input)
	check(e)
	var request producerRequest
	check(json.Unmarshal(b, &request))
	prepared, e := prepareProducer(request)
	check(e)
	if prepared.Kind != manifest.Kind {
		panic("wrong circuit for packet")
	}
	profile.mark("prepareAssignmentMs")
	fmt.Println("stage: load", prepared.Kind)
	reused := artifacts.cs != nil
	if !reused {
		artifacts.cs = groth16.NewCS(ecc.BN254)
		artifacts.pk = groth16.NewProvingKey(ecc.BN254)
		artifacts.vk = groth16.NewVerifyingKey(ecc.BN254)
		readProducerArtifact(filepath.Join(dir, "circuit.bin"), artifacts.cs)
		readProducerArtifact(filepath.Join(dir, "proving.key"), artifacts.pk)
		readProducerArtifact(filepath.Join(dir, "verifying.key"), artifacts.vk)
		artifacts.digest = manifestDigest
	}
	cs, pk, vk := artifacts.cs, artifacts.pk, artifacts.vk
	profile.mark("loadArtifactsMs")
	w, e := frontend.NewWitness(prepared.Assignment, ecc.BN254.ScalarField())
	check(e)
	pub, e := w.Public()
	check(e)
	profile.mark("witnessMs")
	fmt.Println("stage: prove", prepared.Kind)
	proof, e := groth16.Prove(cs, pk, w, solidity.WithProverTargetSolidityVerifier(backend.GROTH16))
	check(e)
	profile.mark("proveMs")
	check(groth16.Verify(proof, vk, pub, solidity.WithVerifierTargetSolidityVerifier(backend.GROTH16)))
	profile.mark("verifyMs")
	values := pub.Vector().(fr.Vector)
	inputs := make([]string, len(values))
	for i := range values {
		inputs[i] = values[i].String()
	}
	encoded := proof.(interface{ MarshalSolidity() []byte }).MarshalSolidity()
	if fmt.Sprintf("%x", sha256.Sum256(mustRead(filepath.Join(dir, "manifest.json")))) != manifestDigest {
		panic("setup changed during proving")
	}
	profile.mark("encodeMs")
	writeProducerJSON(output, map[string]any{"artifactsReused": reused, "profileMs": profile.Stages, "kind": prepared.Kind, "statement": request.Statement, "proof": "0x" + hex.EncodeToString(encoded), "publicInputs": inputs, "pre": prepared.Pre, "valid": prepared.Valid, "elapsedMs": time.Since(start).Milliseconds(), "setupManifestSha256": manifestDigest})
	fmt.Println("stage: verified", prepared.Kind)
}
func mustRead(path string) []byte { b, e := os.ReadFile(path); check(e); return b }

func inspectProducer(input, output string) {
	var r producerRequest
	check(json.Unmarshal(mustRead(input), &r))
	_, _, packet, e := producerContext(r)
	check(e)
	var p bls.G2Affine
	kind := "opening"
	if _, e = p.SetBytes(packet[44:140]); e != nil || p.IsInfinity() || !p.IsInSubGroup() {
		kind = "invalid-point"
	}
	writeProducerJSON(output, map[string]string{"kind": kind})
}

package main

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"

	"vendetta-opening-pairing-experiment/mpcstaged"
	"vendetta-opening-pairing-experiment/mpcstream"
)

const phase2CapacityBeacon = "VENDETTA_UNSAFE_LOCAL_PHASE2_CAPACITY_BEACON_V1"

type Phase2Keys struct {
	Schema                   string            `json:"schema"`
	Log2                     int               `json:"log2"`
	InitializationSHA256     string            `json:"initializationSha256"`
	SourceArtifactSHA256     string            `json:"sourceArtifactSha256"`
	VerificationSHA256       string            `json:"verificationSha256"`
	CommonsArtifactSHA256    string            `json:"commonsArtifactSha256"`
	Beacon                   string            `json:"beacon"`
	SHA256                   map[string]string `json:"sha256"`
	BeaconAfterClosureProven bool              `json:"beaconAfterClosureProven"`
	UnsafeLocalSetup         bool              `json:"unsafeLocalSetup"`
	ProductionApproved       bool              `json:"productionApproved"`
}
type writerToFunc func(io.Writer) (int64, error)

func (f writerToFunc) WriteTo(w io.Writer) (int64, error) { return f(w) }

type countWriter struct {
	w io.Writer
	n int64
}

func (w *countWriter) Write(b []byte) (int, error) {
	n, err := w.w.Write(b)
	w.n += int64(n)
	return n, err
}
func phase2Seal(log2 int, dir string, o Options) error {
	if err := limitsFor("phase2-seal"); err != nil {
		return err
	}
	info, err := pinnedInitialization(o.Initialization, o.InitializationPin, log2)
	if err != nil {
		return err
	}
	a, err := pinnedPhase2Artifact(o.Input, o.InputPin, o.InitializationPin, log2, info.Shape)
	if err != nil {
		return err
	}
	v, err := pinnedPhase2Verification(o.Previous, o.PreviousPin, o.InitializationPin, o.InputPin, log2)
	if err != nil {
		return err
	}
	if a.ParentArtifactSHA256 == o.InitializationPin || v.PreviousVerificationSHA256 == "" || v.ParentArtifactSHA256 != a.ParentArtifactSHA256 {
		return errors.New("phase2 sealing requires verified second contribution")
	}
	commonsInfo, err := pinnedCommons(o.Commons, o.CommonsPin, log2)
	if err != nil {
		return err
	}
	if o.CommonsPin != info.CommonsArtifactHash || commonsInfo.SHA256 != info.CommonsHash {
		return errors.New("phase2 sealed commons context differs")
	}
	// Retain only public SRS, evaluation cache and final contribution. No CS decode.
	f, err := regular(filepath.Join(o.Commons, "commons.bin"))
	if err != nil {
		return err
	}
	commons, err := mpcstream.ReadSealCommons(f, info.Shape.Domain, info.CommonsHash, fileBytes)
	f.Close()
	if err != nil {
		return err
	}
	runtime.GC()
	debug.FreeOSMemory()
	f, err = regular(filepath.Join(o.Initialization, "evaluations.bin"))
	if err != nil {
		return err
	}
	evaluations, err := mpcstream.ReadEvaluations(f, info.Evaluations, info.EvaluationHash, fileBytes, 3<<30)
	f.Close()
	if err != nil {
		return err
	}
	runtime.GC()
	debug.FreeOSMemory()
	p, err := readPhase2State(o.Input, o.InputPin, o.Initialization, o.InitializationPin, log2, info)
	if err != nil {
		return err
	}
	runtime.GC()
	debug.FreeOSMemory()
	pk, vk, err := mpcstaged.Seal(p, &commons, &evaluations, []byte(phase2CapacityBeacon))
	if err != nil {
		return err
	}
	runtime.GC()
	debug.FreeOSMemory()
	if err := outside(dir); err != nil {
		return err
	}
	if err := os.Mkdir(dir, 0700); err != nil {
		return err
	}
	hashes := make(map[string]string)
	_, hashes["proving.key"], err = persistNative(filepath.Join(dir, "proving.key"), pk)
	if err != nil {
		return err
	}
	_, hashes["verifying.key"], err = persistNative(filepath.Join(dir, "verifying.key"), vk)
	if err != nil {
		return err
	}
	export := writerToFunc(func(w io.Writer) (int64, error) {
		counter := &countWriter{w: w}
		err := vk.ExportSolidity(counter)
		return counter.n, err
	})
	_, hashes["Verifier.sol"], err = persistNative(filepath.Join(dir, "Verifier.sol"), export)
	if err != nil {
		return err
	}
	f, err = regular(o.CS)
	if err != nil {
		return err
	}
	defer f.Close()
	stat, err := f.Stat()
	if err != nil {
		return err
	}
	if stat.Size() > 400<<20 || stat.Size() < 32 {
		return errors.New("CS copy byte budget exceeded")
	}
	copyCS := writerToFunc(func(w io.Writer) (int64, error) { return io.Copy(w, io.LimitReader(f, 400<<20)) })
	_, hashes["circuit.bin"], err = persistNative(filepath.Join(dir, "circuit.bin"), copyCS)
	if err != nil {
		return err
	}
	if hashes["circuit.bin"] != info.CSHash {
		return errors.New("copied CS digest differs")
	}
	kind := "local-mpc-test"
	if log2 == 22 {
		kind = "invalid-point"
	} else if log2 == 23 {
		kind = "opening"
	}
	manifest := map[string]any{"kind": kind, "profile": "VENDETTA_OPENING_V2", "unsafeLocalSetup": true, "constraints": info.Constraints, "publicInputs": info.PublicInputs, "sha256": hashes}
	if err := exclusiveJSON(filepath.Join(dir, "manifest.json"), manifest); err != nil {
		return err
	}
	hashes["manifest.json"], err = fileHash(filepath.Join(dir, "manifest.json"))
	if err != nil {
		return err
	}
	return exclusiveJSON(filepath.Join(dir, "keys.json"), Phase2Keys{Schema: "vendetta-unsafe-local-phase2-keys-1", Log2: log2, InitializationSHA256: o.InitializationPin, SourceArtifactSHA256: o.InputPin, VerificationSHA256: o.PreviousPin, CommonsArtifactSHA256: o.CommonsPin, Beacon: phase2CapacityBeacon, SHA256: hashes, UnsafeLocalSetup: true})
}

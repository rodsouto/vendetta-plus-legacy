package main

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"

	native "github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	"vendetta-opening-pairing-experiment/ceremony"
	"vendetta-opening-pairing-experiment/mpcinspect"
)

type Phase2Artifact struct {
	Schema               string `json:"schema"`
	Log2                 int    `json:"log2"`
	InitializationSHA256 string `json:"initializationSha256"`
	ParentArtifactSHA256 string `json:"parentArtifactSha256"`
	Bytes                int64  `json:"bytes"`
	SHA256               string `json:"sha256"`
	ProductionApproved   bool   `json:"productionApproved"`
}
type Phase2Verification struct {
	Schema                     string `json:"schema"`
	Log2                       int    `json:"log2"`
	InitializationSHA256       string `json:"initializationSha256"`
	SourceArtifactSHA256       string `json:"sourceArtifactSha256"`
	ParentArtifactSHA256       string `json:"parentArtifactSha256"`
	PreviousVerificationSHA256 string `json:"previousVerificationSha256"`
	NativeTransitionVerified   bool   `json:"nativeTransitionVerified"`
	ProductionApproved         bool   `json:"productionApproved"`
}

func pinnedDocument(path, pin string, value any) error {
	if err := outside(path); err != nil {
		return err
	}
	f, err := regular(path)
	if err != nil {
		return err
	}
	defer f.Close()
	b, err := ceremony.BoundRead(f)
	if err != nil {
		return err
	}
	if ceremony.Digest(b) != pin {
		return errors.New("document digest differs")
	}
	return ceremony.DecodeDocument(b, value)
}
func pinnedInitialization(dir, pin string, log2 int) (Phase2InitInfo, error) {
	var info Phase2InitInfo
	if err := pinnedDocument(filepath.Join(dir, "phase2-init.json"), pin, &info); err != nil {
		return info, err
	}
	if info.Schema != "vendetta-unsafe-local-phase2-init-1" || info.Log2 != log2 || info.Shape.Phase != 2 || info.Shape.Domain != uint64(1)<<log2 || info.Shape.CircuitSHA256 != info.CSHash || info.ProductionApproved {
		return info, errors.New("phase2 initialization context differs")
	}
	size, err := info.Shape.Size()
	if err != nil {
		return info, err
	}
	if info.InitialBytes != int64(size-32) {
		return info, errors.New("phase2 initial size differs")
	}
	if _, err := info.Evaluations.Vectors(); err != nil {
		return info, err
	}
	return info, nil
}
func pinnedPhase2Artifact(dir, pin, initialPin string, log2 int, shape mpcinspect.Shape) (Phase2Artifact, error) {
	var a Phase2Artifact
	if err := pinnedDocument(filepath.Join(dir, "artifact.json"), pin, &a); err != nil {
		return a, err
	}
	size, err := shape.Size()
	if err != nil {
		return a, err
	}
	if a.Schema != "vendetta-unsafe-local-phase2-artifact-1" || a.Log2 != log2 || a.InitializationSHA256 != initialPin || a.ParentArtifactSHA256 == "" || a.Bytes != int64(size) || a.ProductionApproved {
		return a, errors.New("phase2 artifact context differs")
	}
	return a, nil
}
func pinnedPhase2Verification(path, pin, initialPin, sourcePin string, log2 int) (Phase2Verification, error) {
	var v Phase2Verification
	if err := pinnedDocument(path, pin, &v); err != nil {
		return v, err
	}
	if v.Schema != "vendetta-unsafe-local-phase2-verification-1" || v.Log2 != log2 || v.InitializationSHA256 != initialPin || v.SourceArtifactSHA256 != sourcePin || !v.NativeTransitionVerified || v.ProductionApproved {
		return v, errors.New("phase2 verification context differs")
	}
	return v, nil
}
func readPhase2State(dir, pin, initialDir, initialPin string, log2 int, info Phase2InitInfo) (*native.Phase2, error) {
	initial := pin == initialPin
	name := "contribution.bin"
	bodyPin := ""
	if initial {
		if filepath.Clean(dir) != filepath.Clean(initialDir) {
			return nil, errors.New("initial state directory differs")
		}
		name = "initial.bin"
		bodyPin = info.InitialHash
	} else {
		a, err := pinnedPhase2Artifact(dir, pin, initialPin, log2, info.Shape)
		if err != nil {
			return nil, err
		}
		bodyPin = a.SHA256
	}
	f, err := regular(filepath.Join(dir, name))
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var decoded *mpcinspect.Native
	if initial {
		decoded, err = mpcinspect.DecodeInitialPhase2(f, info.Shape, bodyPin, fileBytes, 3<<30)
	} else {
		decoded, err = mpcinspect.Decode(f, info.Shape, bodyPin, fileBytes, 3<<30)
	}
	if err != nil {
		return nil, err
	}
	return decoded.Phase2, nil
}
func phase2Contribute(log2 int, dir string, o Options) error {
	if err := limitsFor("phase2-contribute"); err != nil {
		return err
	}
	info, err := pinnedInitialization(o.Initialization, o.InitializationPin, log2)
	if err != nil {
		return err
	}
	if o.InputPin != o.InitializationPin {
		if _, err := pinnedPhase2Verification(o.Previous, o.PreviousPin, o.InitializationPin, o.InputPin, log2); err != nil {
			return err
		}
	} else if o.Previous != "" || o.PreviousPin != "" {
		return errors.New("initial phase2 state has no preceding verification")
	}
	p, err := readPhase2State(o.Input, o.InputPin, o.Initialization, o.InitializationPin, log2, info)
	if err != nil {
		return err
	}
	runtime.GC()
	debug.FreeOSMemory()
	p.Contribute()
	if err := outside(dir); err != nil {
		return err
	}
	if err := os.Mkdir(dir, 0700); err != nil {
		return err
	}
	n, pin, err := persistNative(filepath.Join(dir, "contribution.bin"), p)
	if err != nil {
		return err
	}
	size, err := info.Shape.Size()
	if err != nil {
		return err
	}
	if n != int64(size) {
		return errors.New("phase2 contribution size differs")
	}
	return exclusiveJSON(filepath.Join(dir, "artifact.json"), Phase2Artifact{Schema: "vendetta-unsafe-local-phase2-artifact-1", Log2: log2, InitializationSHA256: o.InitializationPin, ParentArtifactSHA256: o.InputPin, Bytes: n, SHA256: pin})
}
func phase2Verify(log2 int, dir string, o Options) error {
	if err := limitsFor("phase2-verify"); err != nil {
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
	if a.ParentArtifactSHA256 != o.ParentPin {
		return errors.New("phase2 predecessor differs")
	}
	if o.ParentPin != o.InitializationPin {
		v, err := pinnedPhase2Verification(o.Previous, o.PreviousPin, o.InitializationPin, o.ParentPin, log2)
		if err != nil {
			return err
		}
		if v.ParentArtifactSHA256 == "" {
			return errors.New("phase2 previous chain is empty")
		}
	} else if o.Previous != "" || o.PreviousPin != "" {
		return errors.New("initial phase2 verification has no preceding verification")
	}
	previous, err := readPhase2State(o.Parent, o.ParentPin, o.Initialization, o.InitializationPin, log2, info)
	if err != nil {
		return err
	}
	runtime.GC()
	debug.FreeOSMemory()
	next, err := readPhase2State(o.Input, o.InputPin, o.Initialization, o.InitializationPin, log2, info)
	if err != nil {
		return err
	}
	runtime.GC()
	debug.FreeOSMemory()
	if err := previous.Verify(next); err != nil {
		return err
	}
	if err := outside(dir); err != nil {
		return err
	}
	if err := os.Mkdir(dir, 0700); err != nil {
		return err
	}
	return exclusiveJSON(filepath.Join(dir, "verification.json"), Phase2Verification{Schema: "vendetta-unsafe-local-phase2-verification-1", Log2: log2, InitializationSHA256: o.InitializationPin, SourceArtifactSHA256: o.InputPin, ParentArtifactSHA256: o.ParentPin, PreviousVerificationSHA256: o.PreviousPin, NativeTransitionVerified: true})
}

var _ io.WriterTo = (*native.Phase2)(nil)

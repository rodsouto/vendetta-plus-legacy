package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strings"
	"syscall"

	"vendetta-opening-pairing-experiment/ceremony"
	"vendetta-opening-pairing-experiment/mpcinspect"
	"vendetta-opening-pairing-experiment/mpcstream"
)

type Verification struct {
	Schema                     string           `json:"schema"`
	Log2                       int              `json:"log2"`
	SourceArtifactSHA256       string           `json:"sourceArtifactSha256"`
	PreviousVerificationSHA256 string           `json:"previousVerificationSha256"`
	TranscriptSHA256           string           `json:"transcriptSha256"`
	Anchor                     mpcstream.Anchor `json:"anchor"`
	NativeTransitionVerified   bool             `json:"nativeTransitionVerified"`
	ProductionApproved         bool             `json:"productionApproved"`
}

func readPinnedVerification(path, pin string, log2 int) (*Verification, error) {
	f, err := regular(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	b, err := ceremony.BoundRead(f)
	if err != nil {
		return nil, err
	}
	if ceremony.Digest(b) != pin {
		return nil, errors.New("verification pin differs")
	}
	v := new(Verification)
	if err := ceremony.DecodeDocument(b, v); err != nil {
		return nil, err
	}
	if v.Schema != "vendetta-unsafe-local-phase1-verification-1" || v.Log2 != log2 || !v.NativeTransitionVerified || v.ProductionApproved || v.Anchor.SHA256 != v.TranscriptSHA256 || v.Anchor.Domain != uint64(1)<<log2 {
		return nil, errors.New("invalid pinned verification context")
	}
	return v, nil
}

func regular(path string) (*os.File, error) {
	f, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NONBLOCK|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return nil, err
	}
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() {
		f.Close()
		return nil, errors.New("regular input required")
	}
	return f, nil
}
func sourceArtifact(dir, pin string, log2 int) (Artifact, error) {
	var a Artifact
	if err := outside(dir); err != nil {
		return a, err
	}
	f, err := regular(filepath.Join(dir, "artifact.json"))
	if err != nil {
		return a, err
	}
	defer f.Close()
	b, err := ceremony.BoundRead(f)
	if err != nil {
		return a, err
	}
	if ceremony.Digest(b) != pin {
		return a, errors.New("source artifact pin differs")
	}
	var header struct {
		Schema string `json:"schema"`
	}
	if err := json.Unmarshal(b, &header); err != nil {
		return a, err
	}
	if header.Schema == "vendetta-unsafe-local-phase1-artifact-1" {
		var first struct {
			Schema             string `json:"schema"`
			Operation          string `json:"operation"`
			Log2               int    `json:"log2"`
			Bytes              int64  `json:"bytes"`
			SHA256             string `json:"sha256"`
			ProductionApproved bool   `json:"productionApproved"`
		}
		if err := ceremony.DecodeDocument(b, &first); err != nil {
			return a, err
		}
		if first.Operation != "first-contribution" {
			return a, errors.New("initial launch artifact must be first contribution")
		}
		a = Artifact{Schema: first.Schema, Operation: first.Operation, Log2: first.Log2, Bytes: first.Bytes, SHA256: first.SHA256, ProductionApproved: first.ProductionApproved}
	} else if header.Schema == "vendetta-unsafe-local-phase1-artifact-2" {
		if err := ceremony.DecodeDocument(b, &a); err != nil {
			return a, err
		}
	} else {
		return a, errors.New("unsupported artifact schema")
	}
	if (a.Operation != "first-contribution" && a.Operation != "second-contribution") || a.Log2 != log2 || a.Bytes != int64(192*(uint64(1)<<log2)+265) || a.ProductionApproved {
		return a, errors.New("unexpected source artifact context")
	}
	return a, nil
}
func verifyFirst(log2 int, dir, input, pin string) error {
	return verifyContribution(log2, dir, input, pin, "", "")
}
func verifyContribution(log2 int, dir, input, pin, previousPath, previousPin string) error {
	if log2 != 3 && log2 != 22 && log2 != 23 {
		return errors.New("unsupported verification domain")
	}
	if err := limitsFor("verify"); err != nil {
		return err
	}
	if log2 != 3 {
		mem, err := readKB("/proc/meminfo", "MemAvailable")
		if err != nil {
			return err
		}
		if mem < 14<<30 {
			return errors.New("verification requires 14 GiB host headroom")
		}
	}
	a, err := sourceArtifact(input, pin, log2)
	if err != nil {
		return err
	}
	if err := outside(dir); err != nil {
		return err
	}
	if err := os.Mkdir(dir, 0700); err != nil {
		return err
	}
	f, err := regular(filepath.Join(input, "contribution.bin"))
	if err != nil {
		return err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || info.Size() != a.Bytes {
		return errors.New("source transcript size differs")
	}
	csPin := strings.Repeat("a", 64)
	if log2 == 22 {
		csPin = "89a9897b75e9cd785bd62feda8fc60ed50239f58e8b60211561fa560d8832898"
	} else if log2 == 23 {
		csPin = "06e4740642174a1f0f03ab0c0f06f2199b996534c30546df6896b9f3ab777b1f"
	}
	shape := mpcinspect.Shape{Schema: "vendetta-hidden-v2-native-shape-1", CircuitSHA256: csPin, Phase: 1, Domain: uint64(1) << log2, PrivateCommitted: []uint64{}}
	previous, err := mpcstream.InitialAnchor(shape.Domain)
	if err != nil {
		return err
	}
	if previousPath != "" {
		v, err := readPinnedVerification(previousPath, previousPin, log2)
		if err != nil {
			return err
		}
		if a.Operation != "second-contribution" || a.ParentArtifactSHA256 != v.SourceArtifactSHA256 {
			return errors.New("second contribution parent differs")
		}
		previous = v.Anchor
	} else if a.Operation != "first-contribution" || a.ParentArtifactSHA256 != "" {
		return errors.New("first contribution context required")
	}
	_, anchor, err := mpcstream.VerifyTransition(f, shape, a.SHA256, previous, fileBytes, 4<<30)
	if err != nil {
		return err
	}
	runtime.GC()
	debug.FreeOSMemory()
	return exclusiveJSON(filepath.Join(dir, "verification.json"), Verification{Schema: "vendetta-unsafe-local-phase1-verification-1", Log2: log2, SourceArtifactSHA256: pin, PreviousVerificationSHA256: previousPin, TranscriptSHA256: a.SHA256, Anchor: anchor, NativeTransitionVerified: true})
}

func limitsFor(operation string) error {
	addr := addressBytes
	memory := int64(5 << 30)
	cpu := cpuSeconds
	if operation == "continue" || operation == "seal" {
		cpu = 9000
	}
	if operation == "verify" {
		addr = 14 << 30
		memory = 8 << 30
	}
	if operation == "inspect-cs" {
		addr = 6 << 30
		memory = 3 << 30
		cpu = 120
	}
	if operation == "phase2-contribute" || operation == "phase2-verify" {
		addr = 10 << 30
		memory = 5 << 30
		cpu = 18000
	}
	if operation == "phase2-init" || operation == "phase2-seal" {
		addr = 14 << 30
		memory = 8 << 30
		cpu = 86400
	}
	if operation == "phase2-init-staged" || operation == "phase2-seal" {
		addr = 10 << 30
		memory = 5 << 30
		cpu = 86400
	}

	for key, n := range map[int]uint64{syscall.RLIMIT_AS: addr, syscall.RLIMIT_CPU: cpu, syscall.RLIMIT_FSIZE: fileBytes, syscall.RLIMIT_CORE: 0} {
		if err := syscall.Setrlimit(key, &syscall.Rlimit{Cur: n, Max: n}); err != nil {
			return err
		}
		var actual syscall.Rlimit
		if err := syscall.Getrlimit(key, &actual); err != nil {
			return err
		}
		if actual.Cur != n || actual.Max != n {
			return errors.New("kernel limit readback mismatch")
		}
	}
	if operation == "phase2-init-staged" {
		memory = 4 << 30
		debug.SetGCPercent(25)
	}
	runtime.GOMAXPROCS(4)
	debug.SetMemoryLimit(memory)
	return nil
}

func loadVerification(path string, log2 int, inputPin string) (*Verification, error) {
	f, err := regular(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	b, err := ceremony.BoundRead(f)
	if err != nil {
		return nil, err
	}
	v := new(Verification)
	if err := ceremony.DecodeDocument(b, v); err != nil {
		return nil, err
	}
	if v.Schema != "vendetta-unsafe-local-phase1-verification-1" || v.Log2 != log2 || v.SourceArtifactSHA256 != inputPin || !v.NativeTransitionVerified || v.ProductionApproved || v.Anchor.SHA256 != v.TranscriptSHA256 {
		return nil, errors.New("invalid verification receipt")
	}
	return v, nil
}

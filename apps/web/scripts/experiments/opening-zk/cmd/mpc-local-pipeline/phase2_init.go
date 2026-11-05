package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"syscall"
	"time"

	native "github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	"vendetta-opening-pairing-experiment/ceremony"
	"vendetta-opening-pairing-experiment/mpcinspect"
	"vendetta-opening-pairing-experiment/mpcstaged"
	"vendetta-opening-pairing-experiment/mpcstream"
)

type Phase2InitInfo struct {
	Constraints         int                       `json:"constraints"`
	PublicInputs        int                       `json:"publicInputs"`
	Schema              string                    `json:"schema"`
	Log2                int                       `json:"log2"`
	CSHash              string                    `json:"csHash"`
	CommonsArtifactHash string                    `json:"commonsArtifactHash"`
	CommonsHash         string                    `json:"commonsHash"`
	Shape               mpcinspect.Shape          `json:"shape"`
	Evaluations         mpcstream.EvaluationShape `json:"evaluations"`
	InitialBytes        int64                     `json:"initialBytes"`
	InitialHash         string                    `json:"initialHash"`
	EvaluationBytes     int64                     `json:"evaluationBytes"`
	EvaluationHash      string                    `json:"evaluationHash"`
	ProductionApproved  bool                      `json:"productionApproved"`
}

func pinnedCommons(dir, pin string, log2 int) (CommonsArtifact, error) {
	var a CommonsArtifact
	f, err := regular(filepath.Join(dir, "commons.json"))
	if err != nil {
		return a, err
	}
	defer f.Close()
	b, err := ceremony.BoundRead(f)
	if err != nil {
		return a, err
	}
	if ceremony.Digest(b) != pin {
		return a, errors.New("commons metadata pin differs")
	}
	if err := ceremony.DecodeDocument(b, &a); err != nil {
		return a, err
	}
	if a.Schema != "vendetta-unsafe-local-commons-1" || a.Log2 != log2 || a.Beacon != capacityBeacon || a.Bytes != int64(192*(uint64(1)<<log2)-56) || a.ProductionApproved || a.BeaconAfterClosureProven {
		return a, errors.New("commons metadata context differs")
	}
	return a, nil
}
func persistNative(path string, value io.WriterTo) (int64, string, error) {
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return 0, "", err
	}
	h := sha256.New()
	buffer := bufio.NewWriterSize(f, 1<<20)
	n, err := value.WriteTo(io.MultiWriter(buffer, h))
	if err == nil {
		err = buffer.Flush()
	}
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err != nil {
		return n, "", err
	}
	if closeErr != nil {
		return n, "", closeErr
	}
	if err := syncDirectory(filepath.Dir(path)); err != nil {
		return n, "", err
	}
	return n, hex.EncodeToString(h.Sum(nil)), nil
}

type evaluationWriter struct{ e *native.Phase2Evaluations }

func (e evaluationWriter) WriteTo(w io.Writer) (int64, error) {
	return mpcstream.WriteEvaluations(w, e.e)
}
func phase2Initialize(log2 int, dir, input, inputPin, csPath, csPin string, staged bool, resumeCache, resumeCachePin string) error {
	if log2 != 3 && log2 != 22 && log2 != 23 {
		return errors.New("unsupported phase two domain")
	}
	operation := "phase2-init"
	if staged {
		operation = "phase2-init-staged"
	}
	if err := limitsFor(operation); err != nil {
		return err
	}
	if log2 != 3 {
		available, err := readKB("/proc/meminfo", "MemAvailable")
		if err != nil {
			return err
		}
		required := uint64(29 << 29)
		if staged {
			required = 10 << 30
		}
		if available < required {
			return errors.New("phase two host headroom unavailable")
		}

	}
	if log2 == 22 && csPin != "89a9897b75e9cd785bd62feda8fc60ed50239f58e8b60211561fa560d8832898" {
		return errors.New("invalid-point CS pin differs")
	}
	if log2 == 23 && csPin != "06e4740642174a1f0f03ab0c0f06f2199b996534c30546df6896b9f3ab777b1f" {
		return errors.New("opening CS pin differs")
	}
	a, err := pinnedCommons(input, inputPin, log2)
	if err != nil {
		return err
	}
	if err := outside(dir); err != nil {
		return err
	}
	if err := os.Mkdir(dir, 0700); err != nil {
		return err
	}
	log, err := os.OpenFile(filepath.Join(dir, "checkpoints.jsonl"), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	defer log.Close()
	emit := func(stage string) error {
		var usage syscall.Rusage
		if err := syscall.Getrusage(syscall.RUSAGE_SELF, &usage); err != nil {
			return err
		}
		if err := json.NewEncoder(log).Encode(map[string]any{"stage": stage, "at": time.Now().UTC().Format(time.RFC3339), "maxRssBytes": usage.Maxrss * 1024}); err != nil {
			return err
		}
		return log.Sync()
	}
	if err := emit("read-cs-start"); err != nil {
		return err
	}
	f, err := regular(csPath)
	if err != nil {
		return err
	}
	compiled, err := mpcstream.ReadCompiledCS(f, csPin, 400<<20)
	f.Close()
	if err != nil {
		return err
	}
	shape, err := mpcinspect.ShapeFromCS(compiled, csPin, 2)
	if err != nil {
		return err
	}
	if shape.Domain != uint64(1)<<log2 {
		return errors.New("phase two CS domain differs")
	}
	evalShape, err := mpcstream.EvaluationShapeFromCS(compiled)
	if err != nil {
		return err
	}
	runtime.GC()
	debug.FreeOSMemory()

	constraints, publicInputs := compiled.GetNbConstraints(), compiled.GetNbPublicVariables()-1
	var p *native.Phase2
	var evals native.Phase2Evaluations
	if staged {
		store, err := mpcstaged.NewStore(filepath.Join(dir, "staged-cache"), csPin, a.SHA256, shape.Domain, resumeCache, resumeCachePin, emit)
		if err != nil {
			return err
		}
		layout, err := mpcstaged.Prepare(compiled, store, func() (io.ReadCloser, error) { return regular(filepath.Join(input, "commons.bin")) })
		if err != nil {
			return err
		}
		compiled = nil
		runtime.GC()
		debug.FreeOSMemory()
		if err = emit("staged-assemble-start"); err != nil {
			return err
		}
		p, evals, err = mpcstaged.Assemble(store, layout)
		if err != nil {
			return err
		}
		if err = emit("staged-initialize-complete"); err != nil {
			return err
		}
	} else {
		if err := emit("read-commons-start"); err != nil {
			return err
		}
		f, err = regular(filepath.Join(input, "commons.bin"))
		if err != nil {
			return err
		}
		commons, err := mpcstream.ReadCommons(f, shape.Domain, a.SHA256, fileBytes, 4<<30)
		f.Close()
		if err != nil {
			return err
		}
		runtime.GC()
		debug.FreeOSMemory()
		if err = emit("native-phase2-initialize-start"); err != nil {
			return err
		}
		p = new(native.Phase2)
		evals = p.Initialize(compiled, &commons)
		if err = emit("native-phase2-initialize-complete"); err != nil {
			return err
		}
		compiled = nil
		commons = native.SrsCommons{}
	}
	runtime.GC()
	debug.FreeOSMemory()
	r := Phase2InitInfo{Constraints: constraints, PublicInputs: publicInputs, Schema: "vendetta-unsafe-local-phase2-init-1", Log2: log2, CSHash: csPin, CommonsArtifactHash: inputPin, CommonsHash: a.SHA256, Shape: shape, Evaluations: evalShape}
	r.InitialBytes, r.InitialHash, err = persistNative(filepath.Join(dir, "initial.bin"), p)
	if err != nil {
		return err
	}
	size, err := shape.Size()
	if err != nil {
		return err
	}
	if uint64(r.InitialBytes) != size-32 {
		return errors.New("initial phase two wire differs")
	}
	r.EvaluationBytes, r.EvaluationHash, err = persistNative(filepath.Join(dir, "evaluations.bin"), evaluationWriter{&evals})
	if err != nil {
		return err
	}
	vectors, err := evalShape.Vectors()
	if err != nil {
		return err
	}
	expected, err := mpcinspect.EvaluationWireSize(vectors)
	if err != nil {
		return err
	}
	if uint64(r.EvaluationBytes) != expected {
		return errors.New("phase two evaluation wire differs")
	}
	if err := emit("phase2-caches-persisted"); err != nil {
		return err
	}
	return exclusiveJSON(filepath.Join(dir, "phase2-init.json"), r)
}

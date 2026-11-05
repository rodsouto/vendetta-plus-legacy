package main

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"

	"vendetta-opening-pairing-experiment/mpcinspect"
	"vendetta-opening-pairing-experiment/mpcstream"
)

type CSInfo struct {
	Schema             string              `json:"schema"`
	SHA256             string              `json:"sha256"`
	Bytes              int64               `json:"bytes"`
	Constraints        int                 `json:"constraints"`
	PublicInputs       int                 `json:"publicInputs"`
	Shapes             [2]mpcinspect.Shape `json:"shapes"`
	ProductionApproved bool                `json:"productionApproved"`
}

func inspectCS(dir, input, pin string) error {
	if err := limitsFor("inspect-cs"); err != nil {
		return err
	}
	f, err := regular(input)
	if err != nil {
		return err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return err
	}
	if info.Size() > 400<<20 || info.Size() < 32 {
		return errors.New("compiled CS input outside byte budget")
	}
	compiled, err := mpcstream.ReadCompiledCS(f, pin, 400<<20)
	if err != nil {
		return err
	}
	runtime.GC()
	debug.FreeOSMemory()
	r := CSInfo{Schema: "vendetta-local-compiled-cs-1", SHA256: pin, Bytes: info.Size(), Constraints: compiled.GetNbConstraints(), PublicInputs: compiled.GetNbPublicVariables() - 1}
	for i := range r.Shapes {
		r.Shapes[i], err = mpcinspect.ShapeFromCS(compiled, pin, uint64(i+1))
		if err != nil {
			return err
		}
		runtime.GC()
	}
	if err := outside(dir); err != nil {
		return err
	}
	if err := os.Mkdir(dir, 0700); err != nil {
		return err
	}
	return exclusiveJSON(filepath.Join(dir, "cs.json"), r)
}

package mpcstream

import (
	"bytes"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	native "github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	cs "github.com/consensys/gnark/constraint/bn254"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
	"vendetta-opening-pairing-experiment/mpcinspect"
)

// Recompute input digests so fuzzing exercises framing and native decoding,
// rather than rejecting every mutated sample at the final checksum comparison.
func FuzzLocalCaches(f *testing.F) {
	compiled, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &evalCircuit{Commit: true})
	if err != nil {
		f.Fatal(err)
	}
	c := compiled.(*cs.R1CS)
	n := ecc.NextPowerOfTwo(uint64(c.GetNbConstraints()))
	p1 := native.NewPhase1(n)
	p1.Contribute()
	commons := p1.Seal([]byte("unsafe fuzz-only"))
	p2 := new(native.Phase2)
	evals := p2.Initialize(c, &commons)
	var commonsBytes, evaluationBytes, initialBytes, csBytes bytes.Buffer
	if _, err := commons.WriteTo(&commonsBytes); err != nil {
		f.Fatal(err)
	}
	if _, err := WriteEvaluations(&evaluationBytes, &evals); err != nil {
		f.Fatal(err)
	}
	if _, err := p2.WriteTo(&initialBytes); err != nil {
		f.Fatal(err)
	}
	if _, err := c.WriteTo(&csBytes); err != nil {
		f.Fatal(err)
	}
	shape, err := mpcinspect.ShapeFromCS(c, digest(csBytes.Bytes()), 2)
	if err != nil {
		f.Fatal(err)
	}
	evaluationShape, err := EvaluationShapeFromCS(c)
	if err != nil {
		f.Fatal(err)
	}
	for kind, body := range [][]byte{commonsBytes.Bytes(), evaluationBytes.Bytes(), initialBytes.Bytes()} {
		f.Add(append([]byte{byte(kind)}, body...))
	}
	f.Fuzz(func(t *testing.T, data []byte) {
		if len(data) == 0 || len(data) > 4096 {
			return
		}
		body := data[1:]
		pin := digest(body)
		switch data[0] % 3 {
		case 0:
			_, _ = ReadCommons(bytes.NewReader(body), n, pin, 4096, 1<<20)
		case 1:
			_, _ = ReadEvaluations(bytes.NewReader(body), evaluationShape, pin, 4096, 1<<20)
		case 2:
			_, _ = mpcinspect.DecodeInitialPhase2(bytes.NewReader(body), shape, pin, 4096, 1<<20)
		}
	})
}

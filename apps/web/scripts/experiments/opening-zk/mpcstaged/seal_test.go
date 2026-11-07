package mpcstaged

import (
	"bytes"
	native "github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	"testing"
)

func TestSealRejectsMismatchedWireVectorsBeforeUpdate(t *testing.T) {
	for _, mode := range []string{"length", "infinity", "extra-commitment", "missing-commitment", "domain", "sigma-count", "sigma-basis", "public-translation", "nil", "zero-index", "duplicate-index", "reversed-indices", "out-of-range-index", "wire-partition"} {
		t.Run(mode, func(t *testing.T) {
			c, commons, _, _ := fixture(t, 9, 2)
			p := new(native.Phase2)
			e := p.Initialize(c, commons)
			before := raw(t, p)
			savedSigma := p.Parameters.G2.Sigma
			switch mode {
			case "nil":
				if _, _, err := Seal(nil, commons, &e, nil); err == nil {
					t.Fatal("nil phase2 accepted")
				}
				return
			case "extra-commitment":
				e.G1.CKK = append(e.G1.CKK, nil)
			case "missing-commitment":
				e.G1.CKK = e.G1.CKK[:0]
			case "domain":
				commons.G1.AlphaTau = commons.G1.AlphaTau[:len(commons.G1.AlphaTau)/2]
			case "sigma-count":
				p.Parameters.G2.Sigma = nil
			case "sigma-basis":
				e.G1.CKK[0] = e.G1.CKK[0][:0]
			case "public-translation":
				e.PublicAndCommitmentCommitted = nil
			case "zero-index":
				e.PublicAndCommitmentCommitted[0] = []int{0}
			case "duplicate-index":
				e.PublicAndCommitmentCommitted[0] = []int{1, 1}
			case "reversed-indices":
				e.PublicAndCommitmentCommitted[1] = []int{2, 1}
			case "out-of-range-index":
				e.PublicAndCommitmentCommitted[0] = []int{len(e.G1.VKK)}
			case "wire-partition":
				e.G1.A = e.G1.A[:len(e.G1.A)-1]
				e.G1.B = e.G1.B[:len(e.G1.B)-1]
				e.G2.B = e.G2.B[:len(e.G2.B)-1]
			case "length":
				e.G1.B = e.G1.B[:len(e.G1.B)-1]
			case "infinity":
				changed := false
				for i := range e.G2.B {
					if !e.G2.B[i].IsInfinity() {
						e.G2.B[i].SetInfinity()
						changed = true
						break
					}
				}
				if !changed {
					t.Fatal("fixture has no finite B point")
				}
			}
			if _, _, err := Seal(p, commons, &e, []byte("unsafe-test")); err == nil {
				t.Fatal("malformed wire vectors accepted")
			}
			p.Parameters.G2.Sigma = savedSigma
			if !bytes.Equal(before, raw(t, p)) {
				t.Fatal("beacon update ran before validation")
			}
		})
	}
}

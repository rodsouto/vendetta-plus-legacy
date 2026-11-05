package mpcstaged

import (
	"bytes"
	native "github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	"testing"
)

func TestSealRejectsMismatchedWireVectorsBeforeUpdate(t *testing.T) {
	for _, mode := range []string{"length", "infinity"} {
		t.Run(mode, func(t *testing.T) {
			c, commons, _, _ := fixture(t, 9, 1)
			p := new(native.Phase2)
			e := p.Initialize(c, commons)
			before := raw(t, p)
			if mode == "length" {
				e.G1.B = e.G1.B[:len(e.G1.B)-1]
			} else {
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
			if !bytes.Equal(before, raw(t, p)) {
				t.Fatal("beacon update ran before validation")
			}
		})
	}
}

package main

import (
	"math/big"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	bls "github.com/consensys/gnark-crypto/ecc/bls12-381"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
	curve "github.com/consensys/gnark/std/algebra/emulated/sw_bls12381"
	"github.com/consensys/gnark/std/math/emulated"
)

type g2ScalarBoundaryCircuit struct {
	Scalar          curve.Scalar
	EqualsGenerator frontend.Variable
}

func (c *g2ScalarBoundaryCircuit) Define(api frontend.API) error {
	g2, err := curve.NewG2(api)
	if err != nil {
		return err
	}
	_, _, _, gen := bls.Generators()
	generator := curve.NewG2Affine(gen)
	actual := g2.ScalarMul(&generator, &c.Scalar)
	api.AssertIsEqual(g2.IsEqual(actual, &generator), c.EqualsGenerator)
	return nil
}

// Isolates the scalar gadget boundary without pretending to find an H3 preimage for r=0.
func TestG2ScalarZeroAndOrderBoundary(t *testing.T) {
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &g2ScalarBoundaryCircuit{})
	if err != nil {
		t.Fatal(err)
	}
	var params curve.ScalarField
	for _, v := range []struct {
		name   string
		scalar *big.Int
		equal  int
	}{
		{"zero", big.NewInt(0), 0}, {"one", big.NewInt(1), 1}, {"order-minus-one", new(big.Int).Sub(params.Modulus(), big.NewInt(1)), 0},
	} {
		t.Run(v.name, func(t *testing.T) {
			for _, claim := range []int{0, 1} {
				a := &g2ScalarBoundaryCircuit{Scalar: emulated.ValueOf[curve.ScalarField](v.scalar), EqualsGenerator: claim}
				w, err := frontend.NewWitness(a, ecc.BN254.ScalarField())
				if err != nil {
					t.Fatal(err)
				}
				err = cs.IsSolved(w)
				if (err == nil) != (claim == v.equal) {
					t.Fatalf("claim=%d expected=%d error=%v", claim, v.equal, err)
				}
			}
		})
	}
}

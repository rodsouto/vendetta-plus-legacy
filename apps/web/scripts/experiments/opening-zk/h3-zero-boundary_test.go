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
	EqualsIdentity  frontend.Variable
	U               curve.G2Affine
	EqualsU         frontend.Variable
}

func (c *g2ScalarBoundaryCircuit) Define(api frontend.API) error {
	g2, err := curve.NewG2(api)
	if err != nil {
		return err
	}
	_, _, _, gen := bls.Generators()
	generator := curve.NewG2Affine(gen)
	identity := curve.NewG2Affine(bls.G2Affine{})
	actual := g2.ScalarMul(&generator, &c.Scalar)
	api.AssertIsEqual(g2.IsEqual(actual, &generator), c.EqualsGenerator)
	api.AssertIsEqual(g2.IsEqual(actual, &identity), c.EqualsIdentity)
	pairing, err := curve.NewPairing(api)
	if err != nil {
		return err
	}
	pairing.AssertIsOnG2(&c.U)
	api.AssertIsEqual(g2.IsEqual(&c.U, &identity), 0)
	api.AssertIsEqual(g2.IsEqual(actual, &c.U), c.EqualsU)
	return nil
}

// Isolates the scalar gadget boundary without pretending to find an H3 preimage for r=0.
func TestG2ScalarZeroAndOrderBoundary(t *testing.T) {
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &g2ScalarBoundaryCircuit{})
	if err != nil {
		t.Fatal(err)
	}
	var params curve.ScalarField
	_, _, _, gen := bls.Generators()
	for _, v := range []struct {
		name   string
		scalar *big.Int
		equal  int
	}{
		{"zero", big.NewInt(0), 0}, {"one", big.NewInt(1), 1}, {"order-minus-one", new(big.Int).Sub(params.Modulus(), big.NewInt(1)), 0},
	} {
		t.Run(v.name, func(t *testing.T) {
			for _, multiple := range []int64{1, 2, 17} {
				var point bls.G2Affine
				point.ScalarMultiplication(&gen, big.NewInt(multiple))
				identity := 0
				if v.scalar.Sign() == 0 {
					identity = 1
				}
				equalsU := 0
				if v.scalar.Cmp(big.NewInt(multiple)) == 0 {
					equalsU = 1
				}
				for mutation := 0; mutation < 4; mutation++ {
					a := &g2ScalarBoundaryCircuit{Scalar: emulated.ValueOf[curve.ScalarField](v.scalar), EqualsGenerator: v.equal, EqualsIdentity: identity, U: curve.NewG2Affine(point), EqualsU: equalsU}
					switch mutation {
					case 1:
						a.EqualsGenerator = 1 - v.equal
					case 2:
						a.EqualsIdentity = 1 - identity
					case 3:
						a.EqualsU = 1 - equalsU
					}
					w, err := frontend.NewWitness(a, ecc.BN254.ScalarField())
					if err != nil {
						t.Fatal(err)
					}
					err = cs.IsSolved(w)
					if (err == nil) != (mutation == 0) {
						t.Fatalf("U=%dG mutation=%d error=%v", multiple, mutation, err)
					}
				}
			}
		})
	}
}

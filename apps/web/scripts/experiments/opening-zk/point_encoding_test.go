package main

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/consensys/gnark-crypto/ecc"
	bls "github.com/consensys/gnark-crypto/ecc/bls12-381"
	"github.com/consensys/gnark-crypto/ecc/bls12-381/fp"
	"github.com/consensys/gnark-crypto/ecc/bls12-381/fr"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
	curve "github.com/consensys/gnark/std/algebra/emulated/sw_bls12381"
	"github.com/consensys/gnark/std/math/emulated"
	"math/big"
	"os"
	"path/filepath"
	"sort"
	"testing"
)

func TestPointEncodingCircuit(t *testing.T) {
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &PointEncodingCircuit{})
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("point encoding constraints=%d public inputs=%d", cs.GetNbConstraints(), cs.GetNbPublicVariables()-1)
	solve := func(t *testing.T, a *PointEncodingCircuit, expected bool) {
		t.Helper()
		w, err := frontend.NewWitness(a, ecc.BN254.ScalarField())
		if err != nil {
			t.Fatal(err)
		}
		err = cs.IsSolved(w)
		if (err == nil) != expected {
			t.Fatalf("expected satisfiable=%v got %v", expected, err)
		}
	}
	_, _, _, gen := bls.Generators()
	compressed := gen.Bytes()
	vectors := pointEncodingVectors(t)
	for name, raw := range vectors {
		t.Run(name, func(t *testing.T) {
			a, err := pointEncodingAssignment(raw)
			if err != nil {
				t.Fatal(err)
			}
			solve(t, a, true)
			a.Valid = 1 - a.Valid.(int)
			solve(t, a, false)
		})
	}
	t.Run("opposite-root-cannot-forge-invalidity", func(t *testing.T) {
		a, err := pointEncodingAssignment(compressed[:])
		if err != nil {
			t.Fatal(err)
		}
		var opposite bls.G2Affine
		opposite.Neg(&gen)
		a.Decode.Y = curve.NewG2Affine(opposite)
		a.Valid = 0
		solve(t, a, false)
	})
	t.Run("opposite-root-rejected-even-with-true-claim", func(t *testing.T) {
		a, err := pointEncodingAssignment(compressed[:])
		if err != nil {
			t.Fatal(err)
		}
		var opposite bls.G2Affine
		opposite.Neg(&gen)
		a.Decode.Y = curve.NewG2Affine(opposite)
		solve(t, a, false)
	})
	t.Run("cannot-choose-nonsquare-branch-for-valid-point", func(t *testing.T) {
		a, err := pointEncodingAssignment(compressed[:])
		if err != nil {
			t.Fatal(err)
		}
		a.Decode.HasSquare = 0
		a.Valid = 0
		solve(t, a, false)
	})
	t.Run("cannot-substitute-Y-for-valid-point", func(t *testing.T) {
		a, err := pointEncodingAssignment(compressed[:])
		if err != nil {
			t.Fatal(err)
		}
		a.Decode.Y.P.Y.A0 = emulated.ValueOf[curve.BaseField](0)
		a.Decode.Y.P.Y.A1 = emulated.ValueOf[curve.BaseField](0)
		a.Valid = 0
		solve(t, a, false)
	})
}

// Integer multiplication without GLV reduction, valid outside the prime subgroup.
func nativeIntegerMul(p bls.G2Affine, n *big.Int) bls.G2Affine {
	var base, acc bls.G2Jac
	base.FromAffine(&p)
	for i := n.BitLen() - 1; i >= 0; i-- {
		acc.DoubleAssign()
		if n.Bit(i) == 1 {
			acc.AddAssign(&base)
		}
	}
	var result bls.G2Affine
	result.FromJacobian(&acc)
	return result
}

func pointEncodingVectors(t *testing.T) map[string][]byte {
	t.Helper()
	_, _, _, gen := bls.Generators()
	compressed := gen.Bytes()
	vectors := map[string][]byte{}
	for i := 0; i < 8; i++ {
		raw := append([]byte(nil), compressed[:]...)
		raw[0] = (raw[0] & 31) | byte(i<<5)
		vectors[string(rune('a'+i))+"-flags"] = raw
	}
	var zero bls.G2Affine
	z := zero.Bytes()
	vectors["identity"] = z[:]
	vectors["all-zero"] = make([]byte, 96)
	for _, side := range []int{0, 1} {
		raw := append([]byte(nil), compressed[:]...)
		p := fp.Modulus().FillBytes(make([]byte, 48))
		copy(raw[48*side:48*(side+1)], p)
		raw[0] = (raw[0] & 31) | 128
		vectors["noncanonical-"+string(rune('0'+side))] = raw
	}
	squareFound, nonsquareFound := false, false
	for i := uint64(0); !squareFound || !nonsquareFound; i++ {
		var p bls.G2Affine
		p.X.A0.SetUint64(i)
		var rhs, b bls.E2
		rhs.Square(&p.X).Mul(&rhs, &p.X)
		b.A0.SetUint64(4)
		b.A1.SetUint64(4)
		rhs.Add(&rhs, &b)
		raw := make([]byte, 96)
		p.X.A0.BigInt(new(big.Int)).FillBytes(raw[48:])
		raw[0] = 128
		if rhs.Legendre() < 0 && !nonsquareFound {
			vectors["nonsquare-x"] = raw
			nonsquareFound = true
		}
		if rhs.Legendre() >= 0 && !squareFound {
			p.Y.Sqrt(&rhs)
			if !p.IsInSubGroup() {
				v := p.Bytes()
				vectors["on-curve-outside-subgroup"] = v[:]
				squareFound = true
			}
		}
		if i > 100 {
			t.Fatal("failed to construct boundary vectors")
		}
	}
	// Boundary encodings, including A0's three unconstrained-by-flags high bits.
	for _, side := range []int{0, 1} {
		raw := append([]byte(nil), compressed[:]...)
		n := new(big.Int).Sub(fp.Modulus(), big.NewInt(1))
		n.FillBytes(raw[48*side : 48*(side+1)])
		raw[0] = (raw[0] & 31) | 128
		vectors[fmt.Sprintf("p-minus-one-%d", side)] = raw
	}
	max := append([]byte(nil), compressed[:]...)
	for i := 48; i < 96; i++ {
		max[i] = 255
	}
	vectors["A0-max-384-bits"] = max
	for _, bit := range []byte{32, 64, 128} {
		raw := append([]byte(nil), compressed[:]...)
		raw[48] |= bit
		vectors[fmt.Sprintf("A0-high-bit-%d", bit)] = raw
	}
	// Full cofactor from the installed @noble/curves 1.9.1 BLS12-381 G2 parameters.
	h, _ := new(big.Int).SetString("5d543a95414e7f1091d50792876a202cd91de4547085abaa68a205b2e5a7ddfa628f1cb4d9e82ef21537e293a6691ae1616ec6e786f0c70cf1c38e31c7238e5", 16)
	order := new(big.Int).Mul(h, fr.Modulus())
	for _, ell := range []int64{13, 23} {
		l := big.NewInt(ell)
		projection := new(big.Int).Set(order)
		for new(big.Int).Mod(projection, l).Sign() == 0 {
			projection.Div(projection, l)
		}
		found := false
		for i := uint64(0); i < 100 && !found; i++ {
			var q bls.G2Affine
			q.X.A0.SetUint64(i)
			var rhs, b bls.E2
			rhs.Square(&q.X).Mul(&rhs, &q.X)
			b.A0.SetUint64(4)
			b.A1.SetUint64(4)
			rhs.Add(&rhs, &b)
			if rhs.Legendre() < 0 {
				continue
			}
			q.Y.Sqrt(&rhs)
			p := nativeIntegerMul(q, projection)
			if p.IsInfinity() {
				continue
			}
			for steps := 0; steps < 8; steps++ {
				next := nativeIntegerMul(p, l)
				if next.IsInfinity() {
					found = true
					break
				}
				p = next
			}
			if !found {
				t.Fatal("small torsion projection failed")
			}
			if p.IsInSubGroup() {
				t.Fatal("torsion unexpectedly in subgroup")
			}
			encoded := p.Bytes()
			vectors[fmt.Sprintf("order-%d-torsion", ell)] = encoded[:]
		}
		if !found {
			t.Fatalf("could not construct order-%d point", ell)
		}
	}

	return vectors
}

// Optional deterministic public fixture export, without compiling a circuit.
func TestExportPointEncodingVectors(t *testing.T) {
	vectors := pointEncodingVectors(t)
	names := make([]string, 0, len(vectors))
	for name := range vectors {
		names = append(names, name)
	}
	sort.Strings(names)
	type item struct {
		Name    string `json:"name"`
		Encoded string `json:"encoded"`
		Valid   bool   `json:"valid"`
	}
	items := make([]item, 0, len(vectors))
	for _, name := range names {
		a, err := pointEncodingAssignment(vectors[name])
		if err != nil {
			t.Fatal(err)
		}
		items = append(items, item{name, hex.EncodeToString(vectors[name]), a.Valid.(int) == 1})
	}
	if target := os.Getenv("VENDETTA_POINT_EXPORT"); target != "" {
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			t.Fatal(err)
		}
		data, err := json.MarshalIndent(map[string]any{"scope": "Public compressed G2 native boundary fixtures, no proof", "vectors": items}, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(target, append(data, '\n'), 0644); err != nil {
			t.Fatal(err)
		}
	}
	t.Logf("native point boundary vectors=%d", len(items))
}

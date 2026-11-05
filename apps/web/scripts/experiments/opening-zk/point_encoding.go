package main

import (
	"math/big"

	bls "github.com/consensys/gnark-crypto/ecc/bls12-381"
	"github.com/consensys/gnark/frontend"
	fields "github.com/consensys/gnark/std/algebra/emulated/fields_bls12381"
	curve "github.com/consensys/gnark/std/algebra/emulated/sw_bls12381"
	"github.com/consensys/gnark/std/math/cmp"
	"github.com/consensys/gnark/std/math/emulated"
	"github.com/consensys/gnark/std/math/uints"
)

// A certificate for the unique decompression branch, not a freely chosen point.
// For nonsquare z in Fp2, Norm(z) is nonsquare in Fp; since p=3 mod 4,
// -Norm(z) has a square root. Norm(z)!=0 prevents ambiguity at zero.
type G2DecodeWitness struct {
	Y              curve.G2Affine
	HasSquare      frontend.Variable
	NonResidueRoot emulated.Element[curve.BaseField]
}

// Returns exact compressed-encoding + nonidentity + subgroup validity.
// No pairing, beacon or H3 is needed to check these public bytes.
func compressedG2Valid(api frontend.API, encoded []uints.U8, w *G2DecodeWitness) (frontend.Variable, error) {
	if len(encoded) != 96 {
		panic("compressed G2 requires 96 bytes")
	}
	f, err := emulated.NewField[curve.BaseField](api)
	if err != nil {
		return nil, err
	}
	g2, err := curve.NewG2(api)
	if err != nil {
		return nil, err
	}
	u, err := uints.NewBytes(api)
	if err != nil {
		return nil, err
	}
	api.AssertIsBoolean(w.HasSquare)
	top := u.ToBits(encoded[0])
	compression, inf, sign := top[7], top[6], top[5]
	raw := append([]uints.U8(nil), encoded...)
	raw[0] = u.FromBits(append(append([]frontend.Variable(nil), top[:5]...), 0, 0, 0)...)
	var params curve.BaseField
	parse := func(bytes []uints.U8) (*emulated.Element[curve.BaseField], frontend.Variable) {
		bits := make([]frontend.Variable, 0, 384)
		for i := len(bytes) - 1; i >= 0; i-- {
			bits = append(bits, u.ToBits(bytes[i])...)
		}
		canonical := cmp.IsLessBinary(api, bits, constantBits(params.Modulus(), 384))
		return f.FromBits(bits...), canonical
	}
	x1, canonical1 := parse(raw[:48])
	x0, canonical0 := parse(raw[48:])
	// Bind both X coordinates. Their field reduction cannot hide noncanonical source bytes.
	f.AssertIsEqual(&w.Y.P.X.A0, x0)
	f.AssertIsEqual(&w.Y.P.X.A1, x1)
	x := &w.Y.P.X
	rhs := g2.Ext2.Mul(x, g2.Ext2.Square(x))
	// BLS12-381's G2 twist is y^2=x^3+4(1+i).
	b := &fields.E2{A0: *f.NewElement(4), A1: *f.NewElement(4)}
	rhs = g2.Ext2.Add(rhs, b)
	curveOK := g2.Ext2.IsZero(g2.Ext2.Sub(g2.Ext2.Square(&w.Y.P.Y), rhs))
	norm := f.Add(f.Mul(&rhs.A0, &rhs.A0), f.Mul(&rhs.A1, &rhs.A1))
	rootOK := f.IsZero(f.Add(f.Mul(&w.NonResidueRoot, &w.NonResidueRoot), norm))
	nonsquareOK := api.And(rootOK, api.Sub(1, f.IsZero(norm)))
	api.AssertIsEqual(api.Select(w.HasSquare, curveOK, nonsquareOK), 1)
	yZero := g2.Ext2.IsZero(&w.Y.P.Y)
	ySign := api.Select(f.IsZero(&w.Y.P.Y.A1), lexSign(api, f, &w.Y.P.Y.A0), lexSign(api, f, &w.Y.P.Y.A1))
	// Nonzero roots must use the encoded sign: choosing the opposite root may not forge invalidity.
	api.AssertIsEqual(api.Mul(w.HasSquare, api.Sub(1, yZero), api.Sub(sign, ySign)), 0)
	signOK := api.Sub(1, api.Mul(yZero, sign))
	_, _, _, nativeGen := bls.Generators()
	generator := curve.NewG2Affine(nativeGen)
	safe := g2.Select(w.HasSquare, &w.Y, &generator)
	var nativeZero bls.G2Affine
	zero := curve.NewG2Affine(nativeZero)
	// Fixed integer r, NOT a scalar reduced modulo r. Unified additions avoid the
	// incomplete-formula assumptions of optimized subgroup-only scalar multiplication.
	add := func(a, b *curve.G2Affine) *curve.G2Affine {
		sum := g2.AddUnified(a, b)
		same := g2.IsEqual(a, b)
		tangentZero := api.And(same, g2.Ext2.IsZero(&a.P.Y))
		return g2.Select(tangentZero, &zero, sum)
	}
	acc := &zero
	r := new(big.Int)
	var scalarParams curve.ScalarField
	r.Set(scalarParams.Modulus())
	for i := r.BitLen() - 1; i >= 0; i-- {
		acc = add(acc, acc)
		if r.Bit(i) == 1 {
			acc = add(acc, safe)
		}
	}
	inSubgroup := g2.IsEqual(acc, &zero)
	nonIdentity := api.Sub(1, g2.IsEqual(safe, &zero))
	valid := api.And(compression, api.Sub(1, inf))
	for _, bit := range []frontend.Variable{canonical0, canonical1, w.HasSquare, signOK, inSubgroup, nonIdentity} {
		valid = api.And(valid, bit)
	}
	return valid, nil
}

type PointEncodingCircuit struct {
	Encoded [6]frontend.Variable `gnark:",public"`
	Valid   frontend.Variable    `gnark:",public"`
	Decode  G2DecodeWitness
}

func (c *PointEncodingCircuit) Define(api frontend.API) error {
	var encoded []uints.U8
	for _, p := range c.Encoded {
		encoded = append(encoded, unpack128(api, p)...)
	}
	valid, err := compressedG2Valid(api, encoded, &c.Decode)
	if err != nil {
		return err
	}
	api.AssertIsBoolean(c.Valid)
	api.AssertIsEqual(c.Valid, valid)
	return nil
}

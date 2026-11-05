package main

import (
	"fmt"
	bls "github.com/consensys/gnark-crypto/ecc/bls12-381"
	"github.com/consensys/gnark-crypto/ecc/bls12-381/fp"
	curve "github.com/consensys/gnark/std/algebra/emulated/sw_bls12381"
	"github.com/consensys/gnark/std/math/emulated"
	"math/big"
)

func decodeG2Assignment(encoded []byte) (G2DecodeWitness, error) {
	if len(encoded) != 96 {
		return G2DecodeWitness{}, fmt.Errorf("expected 96 bytes")
	}
	raw := append([]byte(nil), encoded...)
	raw[0] &= 31
	var p bls.G2Affine
	p.X.A1.SetBigInt(new(big.Int).SetBytes(raw[:48]))
	p.X.A0.SetBigInt(new(big.Int).SetBytes(raw[48:]))
	var rhs, b bls.E2
	rhs.Square(&p.X).Mul(&rhs, &p.X)
	b.A0.SetUint64(4)
	b.A1.SetUint64(4)
	rhs.Add(&rhs, &b)
	result := G2DecodeWitness{HasSquare: 0, NonResidueRoot: emulated.ValueOf[curve.BaseField](0)}
	if rhs.Legendre() >= 0 {
		p.Y.Sqrt(&rhs)
		sign := (encoded[0] & 32) != 0
		if !p.Y.IsZero() && p.Y.LexicographicallyLargest() != sign {
			p.Y.Neg(&p.Y)
		}
		result.HasSquare = 1
	} else {
		var norm, a, root fp.Element
		norm.Square(&rhs.A0)
		a.Square(&rhs.A1)
		norm.Add(&norm, &a).Neg(&norm)
		if root.Sqrt(&norm) == nil {
			return result, fmt.Errorf("negative norm has no square root")
		}
		result.NonResidueRoot = emulated.ValueOf[curve.BaseField](root)
	}
	result.Y = curve.NewG2Affine(p)
	return result, nil
}
func pointEncodingAssignment(encoded []byte) (*PointEncodingCircuit, error) {
	w, err := decodeG2Assignment(encoded)
	if err != nil {
		return nil, err
	}
	result := &PointEncodingCircuit{Decode: w, Valid: 0}
	copy(result.Encoded[:], packBytes(encoded))
	var p bls.G2Affine
	_, err = p.SetBytes(encoded)
	if err == nil && !p.IsInfinity() && p.IsInSubGroup() && encoded[0]&0xc0 == 0x80 {
		result.Valid = 1
	}
	return result, nil
}

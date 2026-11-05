package main

import (
	"github.com/consensys/gnark/frontend"
	curve "github.com/consensys/gnark/std/algebra/emulated/sw_bls12381"
	"github.com/consensys/gnark/std/math/uints"
)

type externalH3 struct {
	pre    []uints.U8
	scalar []uints.U8
}

// Research KEM relation with external H3. Sound ONLY when the consumer checks the
// completed prefix for exactly PrePacked and ScalarPacked. No beacon/mission
// authentication is added here; those remain responsibilities of the full relation.
// Public inputs: signature(3), capsule(8), key(1), result(1), pre(2), scalar(2).
type PaginatedCapsuleCircuit struct {
	Signature       curve.G1Affine
	U               curve.G2Affine
	GT              curve.GTEl
	SignaturePacked [3]frontend.Variable `gnark:",public"`
	CapsulePacked   [8]frontend.Variable `gnark:",public"`
	FileKeyPacked   frontend.Variable    `gnark:",public"`
	CapsuleValid    frontend.Variable    `gnark:",public"`
	PrePacked       [2]frontend.Variable `gnark:",public"`
	ScalarPacked    [2]frontend.Variable `gnark:",public"`
}

func (c *PaginatedCapsuleCircuit) Define(api frontend.API) error {
	inner := CapsuleCircuit{Pair: PairCircuit{Signature: c.Signature, U: c.U, GT: c.GT}, CapsuleValid: c.CapsuleValid}
	for i, p := range c.SignaturePacked {
		copy(inner.SignatureBytes[16*i:16*(i+1)], unpack128(api, p))
	}
	for i, p := range c.CapsulePacked {
		copy(inner.CapsuleBytes[16*i:16*(i+1)], unpack128(api, p))
	}
	copy(inner.FileKey[:], unpack128(api, c.FileKeyPacked))
	ext := &externalH3{}
	for _, p := range c.PrePacked {
		ext.pre = append(ext.pre, unpack128(api, p)...)
	}
	for _, p := range c.ScalarPacked {
		ext.scalar = append(ext.scalar, unpack128(api, p)...)
	}
	return inner.defineWithExternalH3(api, ext)
}

package main

import (
	"encoding/hex"
	"math/big"

	"github.com/consensys/gnark/frontend"
	curve "github.com/consensys/gnark/std/algebra/emulated/sw_bls12381"
	"github.com/consensys/gnark/std/math/uints"
)

// Same KEM relation with 13 public field elements instead of exposing 301 intermediates.
// Every packed input is constrained to 128 bits, preserving the full byte strings.
// No Groth16 setup/proof is implied by testing this relation.
type CompactCapsuleCircuit struct {
	Signature       curve.G1Affine
	U               curve.G2Affine
	GT              curve.GTEl
	SignaturePacked [3]frontend.Variable `gnark:",public"`
	CapsulePacked   [8]frontend.Variable `gnark:",public"`
	FileKeyPacked   frontend.Variable    `gnark:",public"`
	CapsuleValid    frontend.Variable    `gnark:",public"`
	Attempts        int                  `gnark:"-"`
}

func unpack128(api frontend.API, packed frontend.Variable) []uints.U8 {
	u, err := uints.NewBytes(api)
	if err != nil {
		panic(err)
	}
	bs := api.ToBinary(packed, 128)
	out := make([]uints.U8, 16)
	for i := range out {
		out[15-i] = u.FromBits(bs[8*i : 8*(i+1)]...)
	}
	return out
}

func (c *CompactCapsuleCircuit) Define(api frontend.API) error {
	return c.defineWithExternalH3(api, nil)
}

func (c *CompactCapsuleCircuit) defineWithExternalH3(api frontend.API, external *externalH3) error {
	inner := CapsuleCircuit{Pair: PairCircuit{Signature: c.Signature, U: c.U, GT: c.GT}, CapsuleValid: c.CapsuleValid, Attempts: c.Attempts}
	for i, p := range c.SignaturePacked {
		copy(inner.SignatureBytes[16*i:16*(i+1)], unpack128(api, p))
	}
	for i, p := range c.CapsulePacked {
		copy(inner.CapsuleBytes[16*i:16*(i+1)], unpack128(api, p))
	}
	copy(inner.FileKey[:], unpack128(api, c.FileKeyPacked))
	return inner.defineWithExternalH3(api, external)
}

func compactCapsuleAssignment(v capsuleVector) (*CompactCapsuleCircuit, error) {
	inner, err := capsuleAssignment(v)
	if err != nil {
		return nil, err
	}
	sig, err := hex.DecodeString(v.Signature)
	if err != nil {
		return nil, err
	}
	capsule, err := hex.DecodeString(v.Capsule)
	if err != nil {
		return nil, err
	}
	key, err := hex.DecodeString(v.FileKey)
	if err != nil {
		return nil, err
	}
	out := &CompactCapsuleCircuit{Signature: inner.Pair.Signature, U: inner.Pair.U, GT: inner.Pair.GT, CapsuleValid: inner.CapsuleValid, FileKeyPacked: new(big.Int).SetBytes(key)}
	for i := range out.SignaturePacked {
		out.SignaturePacked[i] = new(big.Int).SetBytes(sig[16*i : 16*(i+1)])
	}
	for i := range out.CapsulePacked {
		out.CapsulePacked[i] = new(big.Int).SetBytes(capsule[16*i : 16*(i+1)])
	}
	return out, nil
}

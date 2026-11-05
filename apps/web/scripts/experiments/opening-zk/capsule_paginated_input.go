package main

import (
	"crypto/sha256"
	"encoding/hex"
	bls "github.com/consensys/gnark-crypto/ecc/bls12-381"
	"math/big"
)

func paginatedAssignment(v capsuleVector) (*PaginatedCapsuleCircuit, error) {
	a, err := compactCapsuleAssignment(v)
	if err != nil {
		return nil, err
	}
	sigBytes, _ := hex.DecodeString(v.Signature)
	cb, _ := hex.DecodeString(v.Capsule)
	key, _ := hex.DecodeString(v.FileKey)
	var sig bls.G1Affine
	sig.SetBytes(sigBytes)
	var point bls.G2Affine
	point.SetBytes(cb[:96])
	gt, err := bls.Pair([]bls.G1Affine{sig}, []bls.G2Affine{point})
	if err != nil {
		return nil, err
	}
	serialized := gt.Bytes()
	pad := sha256.Sum256(append([]byte("IBE-H2"), serialized[:]...))
	sigma := make([]byte, 16)
	for i := range sigma {
		sigma[i] = cb[96+i] ^ pad[i]
	}
	pre := sha256.Sum256(append(append([]byte("IBE-H3"), sigma...), key...))
	var scalar *big.Int
	modulus, _ := new(big.Int).SetString("73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001", 16)
	for i := 1; i <= 65534; i++ {
		hash := sha256.Sum256(append([]byte{byte(i), byte(i >> 8)}, pre[:]...))
		hash[0] >>= 1
		candidate := new(big.Int).SetBytes(hash[:])
		if candidate.Cmp(modulus) < 0 {
			scalar = candidate
			break
		}
	}
	if scalar == nil {
		panic("fixture exhausted")
	}
	var sb [32]byte
	scalar.FillBytes(sb[:])
	out := &PaginatedCapsuleCircuit{Signature: a.Signature, U: a.U, GT: a.GT, SignaturePacked: a.SignaturePacked, CapsulePacked: a.CapsulePacked, FileKeyPacked: a.FileKeyPacked, CapsuleValid: a.CapsuleValid}
	for i := 0; i < 2; i++ {
		out.PrePacked[i] = new(big.Int).SetBytes(pre[16*i : 16*(i+1)])
		out.ScalarPacked[i] = new(big.Int).SetBytes(sb[16*i : 16*(i+1)])
	}
	return out, nil
}

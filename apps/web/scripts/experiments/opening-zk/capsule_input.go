package main

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"

	bls "github.com/consensys/gnark-crypto/ecc/bls12-381"
	curve "github.com/consensys/gnark/std/algebra/emulated/sw_bls12381"
	"github.com/consensys/gnark/std/math/uints"
)

type capsuleVector struct {
	Name         string `json:"name"`
	Signature    string `json:"signature"`
	Capsule      string `json:"capsule"`
	FileKey      string `json:"fileKey"`
	CapsuleValid bool   `json:"capsuleValid"`
	Iterations   int    `json:"iterations"`
}

func readCapsuleVectors(path string) ([]capsuleVector, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var input struct {
		Vectors []capsuleVector `json:"vectors"`
	}
	if err = json.Unmarshal(data, &input); err != nil {
		return nil, err
	}
	if len(input.Vectors) != 4 {
		return nil, fmt.Errorf("expected four capsule vectors")
	}
	return input.Vectors, nil
}

func capsuleAssignment(v capsuleVector) (*CapsuleCircuit, error) {
	sb, err := hex.DecodeString(v.Signature)
	if err != nil {
		return nil, err
	}
	cb, err := hex.DecodeString(v.Capsule)
	if err != nil {
		return nil, err
	}
	kb, err := hex.DecodeString(v.FileKey)
	if err != nil {
		return nil, err
	}
	if len(sb) != 48 || len(cb) != 128 || len(kb) != 16 {
		return nil, fmt.Errorf("invalid capsule vector lengths")
	}
	var sig bls.G1Affine
	if _, err = sig.SetBytes(sb); err != nil {
		return nil, err
	}
	var u bls.G2Affine
	if _, err = u.SetBytes(cb[:96]); err != nil {
		return nil, err
	}
	gt, err := bls.Pair([]bls.G1Affine{sig}, []bls.G2Affine{u})
	if err != nil {
		return nil, err
	}
	result := &CapsuleCircuit{Pair: PairCircuit{Signature: curve.NewG1Affine(sig), U: curve.NewG2Affine(u), GT: curve.NewGTEl(gt)}, CapsuleValid: 0}
	if v.CapsuleValid {
		result.CapsuleValid = 1
	}
	copy(result.SignatureBytes[:], uints.NewU8Array(sb))
	copy(result.CapsuleBytes[:], uints.NewU8Array(cb))
	copy(result.FileKey[:], uints.NewU8Array(kb))
	return result, nil
}

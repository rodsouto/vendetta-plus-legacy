// Quicknet's minimal-signature (G1) BLS verification, not the G2/POP ciphersuite.
package main

import (
	"encoding/hex"
	"fmt"

	bls "github.com/consensys/gnark-crypto/ecc/bls12-381"
	"github.com/consensys/gnark/frontend"
	curve "github.com/consensys/gnark/std/algebra/emulated/sw_bls12381"
	"github.com/consensys/gnark/std/math/emulated"
	"github.com/consensys/gnark/std/math/uints"
)

const quicknetPublicKey = "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a"
const quicknetDST = "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_"

func nativeQuicknetKey() (bls.G2Affine, error) {
	var pk bls.G2Affine
	data, err := hex.DecodeString(quicknetPublicKey)
	if err != nil {
		return pk, err
	}
	if _, err = pk.SetBytes(data); err != nil {
		return pk, err
	}
	if pk.IsInfinity() || !pk.IsInSubGroup() {
		return pk, fmt.Errorf("invalid pinned quicknet key")
	}
	return pk, nil
}

func assertQuicknetBeacon(api frontend.API, signature *curve.G1Affine, round frontend.Variable) error {
	bits := api.ToBinary(round, 64)
	api.AssertIsDifferent(round, 0)
	u, err := uints.NewBytes(api)
	if err != nil {
		return err
	}
	encoded := make([]uints.U8, 8)
	for i := range encoded {
		encoded[7-i] = u.FromBits(bits[8*i : 8*(i+1)]...)
	}
	message := shaBytes(api, encoded)
	g1, err := curve.NewG1(api)
	if err != nil {
		return err
	}
	hashed, err := g1.HashToG1(message, []byte(quicknetDST))
	if err != nil {
		return err
	}
	p, err := curve.NewPairing(api)
	if err != nil {
		return err
	}
	p.AssertIsOnG1(signature)
	f, err := emulated.NewField[curve.BaseField](api)
	if err != nil {
		return err
	}
	api.AssertIsEqual(api.And(f.IsZero(&signature.X), f.IsZero(&signature.Y)), 0)
	// Both G2 points and their precomputed lines are compile-time constants, never witness input.
	pk, err := nativeQuicknetKey()
	if err != nil {
		return err
	}
	pk.Neg(&pk)
	_, _, _, generator := bls.Generators()
	genFixed, pkFixed := curve.NewG2AffineFixed(generator), curve.NewG2AffineFixed(pk)
	return p.PairingCheck([]*curve.G1Affine{signature, hashed}, []*curve.G2Affine{&genFixed, &pkFixed})
}

// The signature's compressed encoding is public; coordinates remain a private witness.
type BeaconCircuit struct {
	Signature       curve.G1Affine
	SignaturePacked [3]frontend.Variable `gnark:",public"`
	Round           frontend.Variable    `gnark:",public"`
}

func (c *BeaconCircuit) Define(api frontend.API) error {
	if err := assertQuicknetBeacon(api, &c.Signature, c.Round); err != nil {
		return err
	}
	f, err := emulated.NewField[curve.BaseField](api)
	if err != nil {
		return err
	}
	u, err := uints.NewBytes(api)
	if err != nil {
		return err
	}
	encoded := fieldBytes(api, f, u, &c.Signature.X)
	encoded[0] = u.ValueOf(api.Add(u.Value(encoded[0]), 128, api.Mul(32, lexSign(api, f, &c.Signature.Y))))
	api.AssertIsEqual(sameBytes(api, encoded, unpackPadded(api, c.SignaturePacked[:], 48)), 1)
	return nil
}

// This wrapper requires an authenticated beacon; an invalid beacon has no witness, NOT an
// "invalid mission" output. It uses the exact signature and round of the KEM/age relation.
type AuthenticatedOpeningCircuit struct{ Opening CapsuleAgeCircuit }

func (c *AuthenticatedOpeningCircuit) Define(api frontend.API) error {
	return c.defineWithExternalH3(api, nil)
}

func (c *AuthenticatedOpeningCircuit) defineWithExternalH3(api frontend.API, external *externalH3) error {
	if err := assertQuicknetBeacon(api, &c.Opening.KEM.Signature, c.Opening.Round); err != nil {
		return err
	}
	return c.Opening.defineWithExternalH3(api, external)
}

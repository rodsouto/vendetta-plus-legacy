package main

import (
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	bls "github.com/consensys/gnark-crypto/ecc/bls12-381"
	fr "github.com/consensys/gnark-crypto/ecc/bn254/fr"
	"github.com/consensys/gnark/frontend"
	curve "github.com/consensys/gnark/std/algebra/emulated/sw_bls12381"
)

// Connects the archived EVM proof's public inputs to the actual Node opening vector.
// It does not run a fresh setup and does not claim to validate the full opening predicate.
func TestArchivedPairingWitnessMatchesNodeVector(t *testing.T) {
	dir := filepath.Join("..", "..", "..", "..", "..", "docs", "benchmarks", "timelock-opening")
	var input struct {
		Signature string
		U         string
		GT        []string
	}
	data, err := os.ReadFile(filepath.Join(dir, "pairing-input.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(data, &input); err != nil {
		t.Fatal(err)
	}
	var proof struct {
		PublicInputs []string `json:"publicInputs"`
	}
	data, err = os.ReadFile(filepath.Join(dir, "pairing-proof.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(data, &proof); err != nil {
		t.Fatal(err)
	}
	sb, err := hex.DecodeString(input.Signature)
	if err != nil {
		t.Fatal(err)
	}
	ub, err := hex.DecodeString(input.U)
	if err != nil {
		t.Fatal(err)
	}
	var sig bls.G1Affine
	if _, err = sig.SetBytes(sb); err != nil {
		t.Fatal(err)
	}
	var u bls.G2Affine
	if _, err = u.SetBytes(ub); err != nil {
		t.Fatal(err)
	}
	gt, err := bls.Pair([]bls.G1Affine{sig}, []bls.G2Affine{u})
	if err != nil {
		t.Fatal(err)
	}
	native := []string{gt.C0.B0.A0.String(), gt.C0.B0.A1.String(), gt.C0.B1.A0.String(), gt.C0.B1.A1.String(), gt.C0.B2.A0.String(), gt.C0.B2.A1.String(), gt.C1.B0.A0.String(), gt.C1.B0.A1.String(), gt.C1.B1.A0.String(), gt.C1.B1.A1.String(), gt.C1.B2.A0.String(), gt.C1.B2.A1.String()}
	if len(input.GT) != len(native) {
		t.Fatal("Node GT length mismatch")
	}
	for i := range native {
		if input.GT[i] != native[i] {
			t.Fatalf("Node GT coefficient %d mismatch", i)
		}
	}
	assignment := PairCircuit{Signature: curve.NewG1Affine(sig), U: curve.NewG2Affine(u), GT: curve.NewGTEl(gt)}
	public, err := frontend.NewWitness(&assignment, ecc.BN254.ScalarField(), frontend.PublicOnly())
	if err != nil {
		t.Fatal(err)
	}
	vector := public.Vector().(fr.Vector)
	if len(vector) != len(proof.PublicInputs) {
		t.Fatalf("witness length: %d != %d", len(vector), len(proof.PublicInputs))
	}
	for i := range vector {
		if vector[i].String() != proof.PublicInputs[i] {
			t.Fatalf("public input %d differs from Node opening", i)
		}
	}
}

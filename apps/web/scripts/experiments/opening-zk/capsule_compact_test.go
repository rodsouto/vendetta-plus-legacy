package main

import (
	"math/big"
	"path/filepath"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

func TestCompactCapsuleCircuit(t *testing.T) {
	dir := filepath.Join("..", "..", "..", "..", "..", "docs", "benchmarks", "timelock-opening")
	vectors, err := readCapsuleVectors(filepath.Join(dir, "capsule-input.json"))
	if err != nil {
		t.Fatal(err)
	}
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &CompactCapsuleCircuit{})
	if err != nil {
		t.Fatal(err)
	}
	if cs.GetNbPublicVariables()-1 != 13 {
		t.Fatalf("expected 13 public inputs, got %d", cs.GetNbPublicVariables()-1)
	}
	t.Logf("compact constraints=%d public inputs=%d", cs.GetNbConstraints(), cs.GetNbPublicVariables()-1)
	solve := func(v capsuleVector, mutate func(*CompactCapsuleCircuit), accept bool) {
		t.Helper()
		a, err := compactCapsuleAssignment(v)
		if err != nil {
			t.Fatal(err)
		}
		if mutate != nil {
			mutate(a)
		}
		w, err := frontend.NewWitness(a, ecc.BN254.ScalarField())
		if err != nil {
			t.Fatal(err)
		}
		err = cs.IsSolved(w)
		if (err == nil) != accept {
			t.Fatalf("%s: expected satisfiable=%v, error=%v", v.Name, accept, err)
		}
	}
	for _, v := range vectors {
		solve(v, nil, true)
		solve(v, func(a *CompactCapsuleCircuit) {
			if v.CapsuleValid {
				a.CapsuleValid = 0
			} else {
				a.CapsuleValid = 1
			}
		}, false)
	}
	solve(vectors[0], func(a *CompactCapsuleCircuit) {
		a.FileKeyPacked = new(big.Int).Add(a.FileKeyPacked.(*big.Int), big.NewInt(1))
	}, false)
	// Do not silently reduce packed bytes or discard high bits.
	solve(vectors[0], func(a *CompactCapsuleCircuit) {
		a.SignaturePacked[0] = new(big.Int).Add(a.SignaturePacked[0].(*big.Int), new(big.Int).Lsh(big.NewInt(1), 128))
	}, false)
}

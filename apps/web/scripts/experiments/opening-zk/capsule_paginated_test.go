package main

import (
	"encoding/json"
	"math/big"
	"os"
	"path/filepath"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

func TestPaginatedCapsuleCircuit(t *testing.T) {
	dir := filepath.Join("..", "..", "..", "..", "..", "docs", "benchmarks", "timelock-opening")
	vectors, err := readCapsuleVectors(filepath.Join(dir, "capsule-input.json"))
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"capsule-bound-input.json", "capsule-skip-input.json"} {
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			t.Fatal(err)
		}
		var v capsuleVector
		if err = json.Unmarshal(data, &v); err != nil {
			t.Fatal(err)
		}
		vectors = append(vectors, v)
	}
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &PaginatedCapsuleCircuit{})
	if err != nil {
		t.Fatal(err)
	}
	if cs.GetNbPublicVariables()-1 != 17 {
		t.Fatal("wrong public input count")
	}
	t.Logf("paginated KEM constraints=%d public inputs=%d", cs.GetNbConstraints(), cs.GetNbPublicVariables()-1)
	solve := func(v capsuleVector, mutate func(*PaginatedCapsuleCircuit), expected bool) {
		t.Helper()
		a, err := paginatedAssignment(v)
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
		if (err == nil) != expected {
			t.Fatalf("%s expected satisfiable=%v got %v", v.Name, expected, err)
		}
	}
	for _, v := range vectors {
		t.Run(v.Name, func(t *testing.T) {
			solve(v, nil, true)
			solve(v, func(a *PaginatedCapsuleCircuit) {
				if v.CapsuleValid {
					a.CapsuleValid = 0
				} else {
					a.CapsuleValid = 1
				}
			}, false)
		})
	}
	solve(vectors[0], func(a *PaginatedCapsuleCircuit) {
		a.PrePacked[0] = new(big.Int).Add(a.PrePacked[0].(*big.Int), big.NewInt(1))
	}, false)
	solve(vectors[0], func(a *PaginatedCapsuleCircuit) { a.ScalarPacked[0] = new(big.Int).Lsh(big.NewInt(1), 128) }, false)
	solve(vectors[0], func(a *PaginatedCapsuleCircuit) {
		a.ScalarPacked[0] = new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 128), big.NewInt(1))
		a.ScalarPacked[1] = a.ScalarPacked[0]
	}, false)
	// Deliberately demonstrates why the verifier MUST check the completed prefix.
	// The circuit alone allows an arbitrary canonical scalar and a false KEM claim.
	solve(vectors[0], func(a *PaginatedCapsuleCircuit) { a.ScalarPacked[0] = 0; a.ScalarPacked[1] = 0; a.CapsuleValid = 0 }, true)
}

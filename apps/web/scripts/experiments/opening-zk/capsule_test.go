package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	fr "github.com/consensys/gnark-crypto/ecc/bn254/fr"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
	"github.com/consensys/gnark/std/math/uints"
)

func TestCapsuleCircuit(t *testing.T) {
	input := filepath.Join("..", "..", "..", "..", "..", "docs", "benchmarks", "timelock-opening", "capsule-input.json")
	vectors, err := readCapsuleVectors(input)
	if err != nil {
		t.Fatal(err)
	}
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &CapsuleCircuit{})
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("joined pairing/KEM constraints: %d", cs.GetNbConstraints())
	solve := func(t *testing.T, v capsuleVector, mutate func(*CapsuleCircuit), accept bool) {
		t.Helper()
		a, err := capsuleAssignment(v)
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
			t.Fatalf("expected satisfiable=%v, error=%v", accept, err)
		}
	}
	for _, v := range vectors {
		t.Run(v.Name, func(t *testing.T) { solve(t, v, nil, true) })
		t.Run(v.Name+"-forged-result", func(t *testing.T) {
			solve(t, v, func(a *CapsuleCircuit) {
				if v.CapsuleValid {
					a.CapsuleValid = 0
				} else {
					a.CapsuleValid = 1
				}
			}, false)
		})
	}
	mutations := map[string]func(*CapsuleCircuit){
		"substituted-key":        func(a *CapsuleCircuit) { a.FileKey[0] = uints.NewU8(0) },
		"signature-sign-bit":     func(a *CapsuleCircuit) { a.SignatureBytes[0] = uints.NewU8(0x94) },
		"u-sign-bit":             func(a *CapsuleCircuit) { a.CapsuleBytes[0] = uints.NewU8(0xa7) },
		"u-infinity-flag":        func(a *CapsuleCircuit) { a.CapsuleBytes[0] = uints.NewU8(0xc7) },
		"capsule-v-with-old-key": func(a *CapsuleCircuit) { a.CapsuleBytes[96] = uints.NewU8(0) },
	}
	for name, mutate := range mutations {
		t.Run(name, func(t *testing.T) { solve(t, vectors[0], mutate, false) })
	}

	// A sender can cheaply construct a valid capsule needing five candidates.
	data, err := os.ReadFile(filepath.Join(filepath.Dir(input), "capsule-bound-input.json"))
	if err != nil {
		t.Fatal(err)
	}
	var beyond capsuleVector
	if err = json.Unmarshal(data, &beyond); err != nil {
		t.Fatal(err)
	}
	if !beyond.CapsuleValid || beyond.Iterations != 5 {
		t.Fatal("expected a legitimate five-candidate capsule")
	}
	for _, claim := range []bool{false, true} {
		v := beyond
		v.CapsuleValid = claim
		t.Run(fmt.Sprintf("bound-four-claim-%v", claim), func(t *testing.T) { solve(t, v, nil, false) })
	}
	// A larger profile resolves exactly the same bytes as valid.
	larger, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &CapsuleCircuit{Attempts: 8})
	if err != nil {
		t.Fatal(err)
	}
	for _, claim := range []bool{false, true} {
		v := beyond
		v.CapsuleValid = claim
		a, err := capsuleAssignment(v)
		if err != nil {
			t.Fatal(err)
		}
		w, err := frontend.NewWitness(a, ecc.BN254.ScalarField())
		if err != nil {
			t.Fatal(err)
		}
		err = larger.IsSolved(w)
		if (err == nil) != claim {
			t.Fatalf("larger profile: claim=%v error=%v", claim, err)
		}
	}
}

func TestCapsuleCannotSkipFirstAcceptedCandidate(t *testing.T) {
	input := filepath.Join("..", "..", "..", "..", "..", "docs", "benchmarks", "timelock-opening", "capsule-skip-input.json")
	data, err := os.ReadFile(input)
	if err != nil {
		t.Fatal(err)
	}
	var v capsuleVector
	if err = json.Unmarshal(data, &v); err != nil {
		t.Fatal(err)
	}
	if v.CapsuleValid || v.Iterations != 1 {
		t.Fatal("expected a capsule using a later acceptable scalar")
	}
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &CapsuleCircuit{})
	if err != nil {
		t.Fatal(err)
	}
	for _, claim := range []bool{false, true} {
		v.CapsuleValid = claim
		a, err := capsuleAssignment(v)
		if err != nil {
			t.Fatal(err)
		}
		w, err := frontend.NewWitness(a, ecc.BN254.ScalarField())
		if err != nil {
			t.Fatal(err)
		}
		err = cs.IsSolved(w)
		if (err == nil) == claim {
			t.Fatalf("skipping a candidate: claim=%v error=%v", claim, err)
		}
	}
}

// Binds both archived EVM certificates to the actual cross-language capsule vectors.
func TestArchivedCapsuleWitnessMatchesNodeVectors(t *testing.T) {
	dir := filepath.Join("..", "..", "..", "..", "..", "docs", "benchmarks", "timelock-opening")
	vectors, err := readCapsuleVectors(filepath.Join(dir, "capsule-input.json"))
	if err != nil {
		t.Fatal(err)
	}
	for i, name := range []string{"pairing-proof.json", "invalid-proof.json"} {
		data, err := os.ReadFile(filepath.Join(dir, "capsule-proof", name))
		if err != nil {
			t.Fatal(err)
		}
		var artifact struct {
			PublicInputs []string `json:"publicInputs"`
		}
		if err = json.Unmarshal(data, &artifact); err != nil {
			t.Fatal(err)
		}
		a, err := capsuleAssignment(vectors[i])
		if err != nil {
			t.Fatal(err)
		}
		pub, err := frontend.NewWitness(a, ecc.BN254.ScalarField(), frontend.PublicOnly())
		if err != nil {
			t.Fatal(err)
		}
		values := pub.Vector().(fr.Vector)
		if len(values) != len(artifact.PublicInputs) {
			t.Fatalf("%s: witness length differs", name)
		}
		for j := range values {
			if values[j].String() != artifact.PublicInputs[j] {
				t.Fatalf("%s: public input %d differs", name, j)
			}
		}
	}
}

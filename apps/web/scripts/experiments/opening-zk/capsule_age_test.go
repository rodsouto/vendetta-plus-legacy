package main

import (
	"encoding/base64"
	"encoding/json"
	"math/big"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
	"github.com/consensys/gnark/std/math/uints"
)

func joinedShape(a *AgeCircuit) *CapsuleAgeCircuit {
	return &CapsuleAgeCircuit{Age: *ageShape(a.HeaderLength, a.PlainLength), RoundDecimal: make([]frontend.Variable, 4)}
}
func joinedAssignment(t *testing.T, v ageVector) *CapsuleAgeCircuit {
	t.Helper()
	capsules, err := readCapsuleVectors(filepath.Join(filepath.Dir(ageInputPath()), "capsule-input.json"))
	if err != nil {
		t.Fatal(err)
	}
	kem, err := compactCapsuleAssignment(capsules[0])
	if err != nil {
		t.Fatal(err)
	}
	age, err := ageAssignment(v)
	if err != nil {
		t.Fatal(err)
	}
	result := &CapsuleAgeCircuit{KEM: *kem, Age: *age, Round: 1000, RoundDecimal: []frontend.Variable{1, 0, 0, 0}}
	copy(result.CiphertextHashPacked[:], packBytes(decodeHex(t, strings.TrimPrefix(v.CiphertextHash, "0x"))))
	return result
}
func TestCapsuleAgeCircuit(t *testing.T) {
	vectors, err := readAgeVectors(ageInputPath())
	if err != nil {
		t.Fatal(err)
	}
	a := joinedAssignment(t, vectors[0])
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, joinedShape(&a.Age))
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("joined KEM-age constraints=%d publicInputs=%d", cs.GetNbConstraints(), cs.GetNbPublicVariables()-1)
	solve := func(t *testing.T, v ageVector, mutate func(*CapsuleAgeCircuit), accept bool) {
		t.Helper()
		a := joinedAssignment(t, v)
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
	for _, index := range []int{0, 2, 3, 4, 5} {
		v := vectors[index]
		t.Run(v.Name, func(t *testing.T) { solve(t, v, nil, true) })
	}

	t.Run("cannot-mutate-body-under-original-hash", func(t *testing.T) {
		for _, index := range []int{2, 3} {
			v := vectors[index]
			v.CiphertextHash = vectors[0].CiphertextHash
			solve(t, v, nil, false)
		}
	})
	t.Run("boundary-unauthenticated-signature", func(t *testing.T) {
		data, err := os.ReadFile(filepath.Join(filepath.Dir(ageInputPath()), "age-unauthenticated-input.json"))
		if err != nil {
			t.Fatal(err)
		}
		var boundary struct {
			Signature           string
			Capsule             string
			FileKey             string
			CapsuleValid        bool
			BeaconAuthenticated bool
			Age                 ageVector
		}
		if err = json.Unmarshal(data, &boundary); err != nil {
			t.Fatal(err)
		}
		if boundary.BeaconAuthenticated || boundary.CapsuleValid || boundary.Age.HeaderValid || boundary.Age.PayloadValid || boundary.Age.CiphertextHash != vectors[0].CiphertextHash {
			t.Fatal("bad boundary regression")
		}
		a := joinedAssignment(t, boundary.Age)
		kem, err := compactCapsuleAssignment(capsuleVector{Signature: boundary.Signature, Capsule: boundary.Capsule, FileKey: boundary.FileKey, CapsuleValid: false})
		if err != nil {
			t.Fatal(err)
		}
		a.KEM = *kem
		w, err := frontend.NewWitness(a, ecc.BN254.ScalarField())
		if err != nil {
			t.Fatal(err)
		}
		// This component intentionally has no beacon verifier yet. Requiring satisfiability here
		// documents that its flags alone MUST NOT authorize cancellation, even with the right hash.
		if err = cs.IsSolved(w); err != nil {
			t.Fatalf("expected missing-authentication boundary: %v", err)
		}
	})
	t.Run("cannot-substitute-ciphertext-hash", func(t *testing.T) {
		solve(t, vectors[0], func(a *CapsuleAgeCircuit) {
			a.CiphertextHashPacked[0] = new(big.Int).Add(a.CiphertextHashPacked[0].(*big.Int), big.NewInt(1))
		}, false)
	})
	t.Run("cannot-mix-file-keys", func(t *testing.T) { solve(t, vectors[6], nil, false) })
	t.Run("cannot-mix-header-and-capsule", func(t *testing.T) { solve(t, vectors[1], nil, false) })
	t.Run("cannot-change-header-round", func(t *testing.T) {
		solve(t, vectors[0], func(a *CapsuleAgeCircuit) { a.Round = 1001; a.RoundDecimal[3] = 1 }, false)
	})
	t.Run("cannot-forge-payload-valid", func(t *testing.T) { solve(t, vectors[3], func(a *CapsuleAgeCircuit) { a.Age.PayloadValid = 1 }, false) })
	t.Run("cannot-forge-kem-valid", func(t *testing.T) { solve(t, vectors[0], func(a *CapsuleAgeCircuit) { a.KEM.CapsuleValid = 0 }, false) })
	t.Run("cannot-discard-packed-high-bits", func(t *testing.T) {
		solve(t, vectors[0], func(a *CapsuleAgeCircuit) {
			a.KEM.CapsulePacked[0] = new(big.Int).Add(a.KEM.CapsulePacked[0].(*big.Int), new(big.Int).Lsh(big.NewInt(1), 128))
		}, false)
	})
}

type base64Circuit struct {
	Raw     [128]uints.U8
	Encoded [171]uints.U8
}

func (c *base64Circuit) Define(api frontend.API) error {
	api.AssertIsEqual(sameBytes(api, base64Unpadded(api, c.Raw[:]), c.Encoded[:]), 1)
	return nil
}
func TestCanonicalCapsuleBase64(t *testing.T) {
	raw := make([]byte, 128)
	for i := range raw {
		raw[i] = byte(i*79 + 17)
	}
	encoded := base64.RawStdEncoding.EncodeToString(raw)
	a := &base64Circuit{}
	copy(a.Raw[:], uints.NewU8Array(raw))
	copy(a.Encoded[:], uints.NewU8Array([]byte(encoded)))
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &base64Circuit{})
	if err != nil {
		t.Fatal(err)
	}
	w, err := frontend.NewWitness(a, ecc.BN254.ScalarField())
	if err != nil {
		t.Fatal(err)
	}
	if err = cs.IsSolved(w); err != nil {
		t.Fatal(err)
	}
	a.Encoded[170] = uints.NewU8('A')
	w, err = frontend.NewWitness(a, ecc.BN254.ScalarField())
	if err != nil {
		t.Fatal(err)
	}
	if cs.IsSolved(w) == nil {
		t.Fatal("changed base64 accepted")
	}
}

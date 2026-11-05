package main

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"math/big"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	bls "github.com/consensys/gnark-crypto/ecc/bls12-381"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
	curve "github.com/consensys/gnark/std/algebra/emulated/sw_bls12381"
)

type beaconVector struct {
	Name       string
	Round      string
	Signature  string
	Expected   bool
	RoundBytes string
	Message    string
	HashToG1   struct{ X, Y string }
}

func readBeaconVectors(t *testing.T) []beaconVector {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(filepath.Dir(ageInputPath()), "beacon-input.json"))
	if err != nil {
		t.Fatal(err)
	}
	var input struct {
		PublicKey, ChainHash, Scheme, Dst string
		Vectors                           []beaconVector
	}
	if err = json.Unmarshal(data, &input); err != nil {
		t.Fatal(err)
	}
	if input.PublicKey != quicknetPublicKey || input.ChainHash != quicknetHash || input.Scheme != "bls-unchained-g1-rfc9380" || input.Dst != quicknetDST {
		t.Fatal("Node/Go quicknet parameters differ")
	}
	if len(input.Vectors) != 7 {
		t.Fatal("expected seven beacon vectors")
	}
	return input.Vectors
}
func beaconAssignment(t *testing.T, v beaconVector) *BeaconCircuit {
	t.Helper()
	var sig bls.G1Affine
	b := decodeHex(t, v.Signature)
	if _, err := sig.SetBytes(b); err != nil {
		t.Fatal(err)
	}
	round, ok := new(big.Int).SetString(v.Round, 10)
	if !ok {
		t.Fatal("invalid round")
	}
	a := &BeaconCircuit{Signature: curve.NewG1Affine(sig), Round: round}
	copy(a.SignaturePacked[:], packBytes(b))
	return a
}
func TestQuicknetBeaconNativeInterop(t *testing.T) {
	vectors := readBeaconVectors(t)
	pk, err := nativeQuicknetKey()
	if err != nil {
		t.Fatal(err)
	}
	pk.Neg(&pk)
	_, _, _, gen := bls.Generators()
	for _, v := range vectors {
		t.Run(v.Name, func(t *testing.T) {
			round, err := strconv.ParseUint(v.Round, 10, 64)
			if err != nil {
				t.Fatal(err)
			}
			var raw [8]byte
			binary.BigEndian.PutUint64(raw[:], round)
			message := sha256.Sum256(raw[:])
			if hex.EncodeToString(raw[:]) != v.RoundBytes || hex.EncodeToString(message[:]) != v.Message {
				t.Fatal("round prehash differs from Node")
			}
			h, err := bls.HashToG1(message[:], []byte(quicknetDST))
			if err != nil {
				t.Fatal(err)
			}
			if h.X.String() != v.HashToG1.X || h.Y.String() != v.HashToG1.Y {
				t.Fatal("hash-to-G1 differs from Noble")
			}
			var sig bls.G1Affine
			if _, err = sig.SetBytes(decodeHex(t, v.Signature)); err != nil {
				t.Fatal(err)
			}
			ok, err := bls.PairingCheck([]bls.G1Affine{sig, h}, []bls.G2Affine{gen, pk})
			if err != nil {
				t.Fatal(err)
			}
			ok = ok && !sig.IsInfinity() && sig.IsInSubGroup()
			if ok != v.Expected {
				t.Fatalf("native BLS expected=%v got=%v", v.Expected, ok)
			}
		})
	}
}
func TestQuicknetBeaconCircuit(t *testing.T) {
	vectors := readBeaconVectors(t)
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &BeaconCircuit{})
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("quicknet constraints=%d publicInputs=%d", cs.GetNbConstraints(), cs.GetNbPublicVariables()-1)
	solve := func(t *testing.T, v beaconVector, mutate func(*BeaconCircuit), accept bool) {
		t.Helper()
		a := beaconAssignment(t, v)
		if mutate != nil {
			mutate(a)
		}
		w, err := frontend.NewWitness(a, ecc.BN254.ScalarField())
		if err != nil {
			t.Fatal(err)
		}
		err = cs.IsSolved(w)
		if (err == nil) != accept {
			t.Fatalf("expected satisfiable=%v error=%v", accept, err)
		}
	}
	for _, v := range vectors {
		t.Run(v.Name, func(t *testing.T) { solve(t, v, nil, v.Expected) })
	}
	mutations := map[string]func(*BeaconCircuit){
		"cannot-substitute-compressed-signature": func(a *BeaconCircuit) {
			a.SignaturePacked[0] = new(big.Int).Add(a.SignaturePacked[0].(*big.Int), big.NewInt(1))
		},
		"cannot-discard-signature-high-bits": func(a *BeaconCircuit) {
			a.SignaturePacked[0] = new(big.Int).Add(a.SignaturePacked[0].(*big.Int), new(big.Int).Lsh(big.NewInt(1), 128))
		},
		"cannot-discard-round-high-bits": func(a *BeaconCircuit) {
			a.Round = new(big.Int).Add(a.Round.(*big.Int), new(big.Int).Lsh(big.NewInt(1), 64))
		},
		"round-zero-rejected": func(a *BeaconCircuit) { a.Round = 0 },
	}
	for name, mutate := range mutations {
		t.Run(name, func(t *testing.T) { solve(t, vectors[0], mutate, false) })
	}
}

func TestAuthenticatedOpeningCircuit(t *testing.T) {
	vectors, err := readAgeVectors(ageInputPath())
	if err != nil {
		t.Fatal(err)
	}
	first := joinedAssignment(t, vectors[0])
	shape := &AuthenticatedOpeningCircuit{Opening: *joinedShape(&first.Age)}
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, shape)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("authenticated opening constraints=%d publicInputs=%d", cs.GetNbConstraints(), cs.GetNbPublicVariables()-1)
	solve := func(t *testing.T, a *CapsuleAgeCircuit, accept bool) {
		t.Helper()
		w, err := frontend.NewWitness(&AuthenticatedOpeningCircuit{Opening: *a}, ecc.BN254.ScalarField())
		if err != nil {
			t.Fatal(err)
		}
		err = cs.IsSolved(w)
		if (err == nil) != accept {
			t.Fatalf("expected satisfiable=%v error=%v", accept, err)
		}
	}
	for _, index := range []int{0, 2, 3, 4, 5} {
		v := vectors[index]
		t.Run(v.Name, func(t *testing.T) { solve(t, joinedAssignment(t, v), true) })
	}
	t.Run("reject-original-forged-beacon-regression", func(t *testing.T) {
		data, err := os.ReadFile(filepath.Join(filepath.Dir(ageInputPath()), "age-unauthenticated-input.json"))
		if err != nil {
			t.Fatal(err)
		}
		var b struct {
			Signature, Capsule, FileKey string
			Age                         ageVector
		}
		if err = json.Unmarshal(data, &b); err != nil {
			t.Fatal(err)
		}
		if b.Age.CiphertextHash != vectors[0].CiphertextHash {
			t.Fatal("original hash must remain unchanged")
		}
		a := joinedAssignment(t, b.Age)
		kem, err := compactCapsuleAssignment(capsuleVector{Signature: b.Signature, Capsule: b.Capsule, FileKey: b.FileKey, CapsuleValid: false})
		if err != nil {
			t.Fatal(err)
		}
		a.KEM = *kem
		solve(t, a, false)
	})
	t.Run("reject-valid-signature-for-other-round", func(t *testing.T) {
		beacons := readBeaconVectors(t)
		a := joinedAssignment(t, vectors[0])
		b := beaconAssignment(t, beacons[1])
		a.KEM.Signature = b.Signature
		a.KEM.SignaturePacked = b.SignaturePacked
		// The signature is authentic for 1001 but the canonical header and public round still say 1000.
		solve(t, a, false)
	})
	t.Run("reject-plaintext-substitution", func(t *testing.T) {
		a := joinedAssignment(t, vectors[0])
		a.Age.PlainPacked[0] = new(big.Int).Add(a.Age.PlainPacked[0].(*big.Int), new(big.Int).Lsh(big.NewInt(1), 120))
		solve(t, a, false)
	})
	t.Run("reject-ciphertext-hash-substitution", func(t *testing.T) {
		a := joinedAssignment(t, vectors[0])
		a.CiphertextHashPacked[0] = new(big.Int).Add(a.CiphertextHashPacked[0].(*big.Int), big.NewInt(1))
		solve(t, a, false)
	})
}

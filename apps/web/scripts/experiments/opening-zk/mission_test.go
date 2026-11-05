package main

import (
	"encoding/json"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/constraint"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

func missionInputPath() string {
	return filepath.Join(filepath.Dir(ageInputPath()), "mission-input.json")
}
func TestMissionMessageCircuit(t *testing.T) {
	vectors, err := readMissionVectors(missionInputPath())
	if err != nil {
		t.Fatal(err)
	}
	cache := map[string]constraint.ConstraintSystem{}
	for _, v := range vectors {
		t.Run(v.Name, func(t *testing.T) {
			shape := messageShape(v)
			key := fmt.Sprintf("%d/%d/%d/%d/%d", shape.PlainLength, len(v.Decimals[0]), len(v.Decimals[1]), len(v.Decimals[2]), len(v.Decimals[3]))
			cs := cache[key]
			if cs == nil {
				cs, err = frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, shape)
				if err != nil {
					t.Fatal(err)
				}
				cache[key] = cs
				t.Logf("message profile=%s constraints=%d publicInputs=%d", key, cs.GetNbConstraints(), cs.GetNbPublicVariables()-1)
			}
			solve := func(claim int) error {
				a, err := messageAssignment(v)
				if err != nil {
					t.Fatal(err)
				}
				a.Valid = claim
				w, err := frontend.NewWitness(a, ecc.BN254.ScalarField())
				if err != nil {
					t.Fatal(err)
				}
				return cs.IsSolved(w)
			}
			expected := 0
			if v.Expected == "valid" {
				expected = 1
			}
			if v.Profile == "unsupported" || v.Profile == "unsupported-context" {
				if solve(0) == nil || solve(1) == nil {
					t.Fatal("unsupported/untrusted input produced a certificate")
				}
				return
			}
			if err = solve(expected); err != nil {
				t.Fatal(err)
			}
			if solve(1-expected) == nil {
				t.Fatal("forged validity result accepted")
			}
		})
	}
}
func TestMissionContextAndParserBindings(t *testing.T) {
	vectors, err := readMissionVectors(missionInputPath())
	if err != nil {
		t.Fatal(err)
	}
	v := vectors[0]
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, messageShape(v))
	if err != nil {
		t.Fatal(err)
	}
	mutations := map[string]func(*MessageCircuit){
		"owner-with-original-statement": func(a *MessageCircuit) { a.Context.Words[5][1] = 2 },
		"chain-with-original-statement": func(a *MessageCircuit) { a.Context.Words[1][1] = 101 },
		"game-with-original-statement": func(a *MessageCircuit) {
			a.Context.Words[2][1] = new(big.Int).Add(a.Context.Words[2][1].(*big.Int), big.NewInt(1))
		},
		"mission-with-original-statement":  func(a *MessageCircuit) { a.Context.Words[3][1] = 2 },
		"cannot-discard-context-high-bits": func(a *MessageCircuit) { a.Context.Words[5][0] = new(big.Int).Lsh(big.NewInt(1), 128) },
		"cannot-discard-statement-high-bits": func(a *MessageCircuit) {
			a.Context.StatementPacked[0] = new(big.Int).Add(a.Context.StatementPacked[0].(*big.Int), new(big.Int).Lsh(big.NewInt(1), 128))
		},
		"cannot-substitute-message-digits": func(a *MessageCircuit) { a.Message.Digits[2][0] = 3 },
		"cannot-forge-grid-row":            func(a *MessageCircuit) { a.Message.TargetRow = 1 },
	}
	for name, mutate := range mutations {
		t.Run(name, func(t *testing.T) {
			a, err := messageAssignment(v)
			if err != nil {
				t.Fatal(err)
			}
			mutate(a)
			w, err := frontend.NewWitness(a, ecc.BN254.ScalarField())
			if err != nil {
				t.Fatal(err)
			}
			if cs.IsSolved(w) == nil {
				t.Fatal("tampered context/message accepted")
			}
		})
	}
}
func TestMissionOpeningCircuit(t *testing.T) {
	vectors, err := readMissionVectors(missionInputPath())
	if err != nil {
		t.Fatal(err)
	}
	ages, err := readAgeVectors(ageInputPath())
	if err != nil {
		t.Fatal(err)
	}
	first := joinedAssignment(t, ages[0])
	shape := &MissionOpeningCircuit{Opening: AuthenticatedOpeningCircuit{Opening: *joinedShape(&first.Age)}, Message: messageShape(vectors[0]).Message}
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, shape)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("mission opening constraints=%d publicInputs=%d", cs.GetNbConstraints(), cs.GetNbPublicVariables()-1)
	solve := func(t *testing.T, v missionVector, age ageVector, claim int, mutate func(*MissionOpeningCircuit), accept bool) {
		t.Helper()
		ctx, err := contextAssignment(v)
		if err != nil {
			t.Fatal(err)
		}
		msg, err := messageWitness(v)
		if err != nil {
			t.Fatal(err)
		}
		a := &MissionOpeningCircuit{Opening: AuthenticatedOpeningCircuit{Opening: *joinedAssignment(t, age)}, Context: ctx, Message: msg, Valid: claim}
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
	t.Run("archived-valid-mission", func(t *testing.T) { solve(t, vectors[0], ages[0], 1, nil, true) })
	t.Run("cannot-forfeit-valid-mission", func(t *testing.T) { solve(t, vectors[0], ages[0], 0, nil, false) })
	t.Run("wrong-commitment", func(t *testing.T) {
		solve(t, vectors[1], ages[0], 0, nil, true)
		solve(t, vectors[1], ages[0], 1, nil, false)
	})
	t.Run("wrong-owner", func(t *testing.T) { solve(t, vectors[2], ages[0], 0, nil, true) })
	t.Run("cannot-substitute-statement", func(t *testing.T) {
		solve(t, vectors[0], ages[0], 1, func(a *MissionOpeningCircuit) {
			a.Context.StatementPacked[0] = new(big.Int).Add(a.Context.StatementPacked[0].(*big.Int), big.NewInt(1))
		}, false)
	})
	t.Run("cannot-substitute-context-ciphertext", func(t *testing.T) {
		solve(t, vectors[0], ages[0], 0, func(a *MissionOpeningCircuit) {
			a.Context.Words[19][1] = new(big.Int).Add(a.Context.Words[19][1].(*big.Int), big.NewInt(1))
		}, false)
	})
	t.Run("cannot-substitute-arrival", func(t *testing.T) { solve(t, vectors[23], ages[0], 0, nil, false) })
}

func TestMissionEncryptedOpeningCircuit(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(filepath.Dir(missionInputPath()), "mission-encrypted-input.json"))
	if err != nil {
		t.Fatal(err)
	}
	var input struct {
		Encrypted []struct {
			Mission                 missionVector
			Age                     ageVector
			Expected                string
			LibraryInteroperability bool
		}
		DamagedMission missionVector
	}
	if err = json.Unmarshal(data, &input); err != nil {
		t.Fatal(err)
	}
	if len(input.Encrypted) != 4 {
		t.Fatal("expected four encrypted cases")
	}
	originals, err := readMissionVectors(missionInputPath())
	if err != nil {
		t.Fatal(err)
	}
	ages, err := readAgeVectors(ageInputPath())
	if err != nil {
		t.Fatal(err)
	}
	cache := map[string]constraint.ConstraintSystem{}
	makeAssignment := func(t *testing.T, v missionVector, age ageVector, claim int) *MissionOpeningCircuit {
		t.Helper()
		ctx, err := contextAssignment(v)
		if err != nil {
			t.Fatal(err)
		}
		msg, err := messageWitness(v)
		if err != nil {
			t.Fatal(err)
		}
		return &MissionOpeningCircuit{Opening: AuthenticatedOpeningCircuit{Opening: *joinedAssignment(t, age)}, Context: ctx, Message: msg, Valid: claim}
	}
	var baseline constraint.ConstraintSystem
	for _, item := range input.Encrypted {
		t.Run(item.Mission.Name, func(t *testing.T) {
			if !item.LibraryInteroperability {
				t.Fatal("library interoperability was not checked")
			}
			v := item.Mission
			a := makeAssignment(t, v, item.Age, 0)
			key := fmt.Sprintf("%d/%d/%d/%d/%d", a.Opening.Opening.Age.PlainLength, len(v.Decimals[0]), len(v.Decimals[1]), len(v.Decimals[2]), len(v.Decimals[3]))
			cs := cache[key]
			if cs == nil {
				shape := &MissionOpeningCircuit{Opening: AuthenticatedOpeningCircuit{Opening: *joinedShape(&a.Opening.Opening.Age)}, Message: messageShape(v).Message}
				cs, err = frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, shape)
				if err != nil {
					t.Fatal(err)
				}
				cache[key] = cs
				t.Logf("encrypted mission profile=%s constraints=%d publicInputs=%d", key, cs.GetNbConstraints(), cs.GetNbPublicVariables()-1)
			}
			if a.Opening.Opening.Age.PlainLength == 19 {
				baseline = cs
			}
			for _, claim := range []int{0, 1} {
				a.Valid = claim
				w, err := frontend.NewWitness(a, ecc.BN254.ScalarField())
				if err != nil {
					t.Fatal(err)
				}
				err = cs.IsSolved(w)
				accept := (claim == 1) == (item.Expected == "valid")
				if (err == nil) != accept {
					t.Fatalf("claim=%d expected satisfiable=%v error=%v", claim, accept, err)
				}
			}
		})
	}
	if baseline == nil {
		t.Fatal("missing 19-byte profile")
	}
	solveBaseline := func(t *testing.T, a *MissionOpeningCircuit, accept bool) {
		t.Helper()
		w, err := frontend.NewWitness(a, ecc.BN254.ScalarField())
		if err != nil {
			t.Fatal(err)
		}
		err = baseline.IsSolved(w)
		if (err == nil) != accept {
			t.Fatalf("expected satisfiable=%v error=%v", accept, err)
		}
	}
	t.Run("authenticated-crypto-failure-needs-no-json-parse", func(t *testing.T) {
		a := makeAssignment(t, input.DamagedMission, ages[3], 0)
		solveBaseline(t, a, true)
		a.Valid = 1
		solveBaseline(t, a, false)
	})
	t.Run("different-ciphertext-cannot-forfeit-original-mission", func(t *testing.T) { solveBaseline(t, makeAssignment(t, originals[0], ages[3], 0), false) })
	t.Run("unauthenticated-beacon-cannot-forfeit-original-mission", func(t *testing.T) {
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
		a := makeAssignment(t, originals[0], b.Age, 0)
		kem, err := compactCapsuleAssignment(capsuleVector{Signature: b.Signature, Capsule: b.Capsule, FileKey: b.FileKey, CapsuleValid: false})
		if err != nil {
			t.Fatal(err)
		}
		a.Opening.Opening.KEM = *kem
		solveBaseline(t, a, false)
	})
}

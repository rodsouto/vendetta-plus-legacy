package main

import (
	"encoding/hex"
	"encoding/json"
	"math/big"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

func TestMissionV2Circuit(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(filepath.Dir(ageInputPath()), "codec-v2", "vectors.json"))
	if err != nil {
		t.Fatal(err)
	}
	var file struct{ Vectors []json.RawMessage }
	if err = json.Unmarshal(data, &file); err != nil {
		t.Fatal(err)
	}
	if len(file.Vectors) != 9 {
		t.Fatal("expected nine v2 vectors")
	}
	shape := &MissionV2Circuit{Opening: AuthenticatedOpeningCircuit{Opening: CapsuleAgeCircuit{Age: *ageShape(290, 37), RoundDecimal: make([]frontend.Variable, 16), CodecV2: true}}}
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, shape)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("v2 mission constraints=%d public inputs=%d", cs.GetNbConstraints(), cs.GetNbPublicVariables()-1)
	assignment := func(t *testing.T, raw json.RawMessage) (*MissionV2Circuit, bool) {
		t.Helper()
		a, valid, err := missionV2Assignment(raw)
		if err != nil {
			t.Fatal(err)
		}
		return a, valid
	}
	solve := func(t *testing.T, a *MissionV2Circuit, expected bool) {
		t.Helper()
		w, err := frontend.NewWitness(a, ecc.BN254.ScalarField())
		if err != nil {
			t.Fatal(err)
		}
		err = cs.IsSolved(w)
		if (err == nil) != expected {
			t.Fatalf("expected satisfiable=%v got %v", expected, err)
		}
	}
	for _, raw := range file.Vectors {
		var name struct{ Name string }
		json.Unmarshal(raw, &name)
		t.Run(name.Name, func(t *testing.T) {
			a, valid := assignment(t, raw)
			if !valid {
				a.Valid = 0
			}
			solve(t, a, true)
			a.Valid = 1 - a.Valid.(int)
			solve(t, a, false)
		})
	}
	t.Run("exhaustion-placeholder-needs-terminal-cache", func(t *testing.T) {
		a, _ := assignment(t, file.Vectors[0])
		a.ScalarPacked[0] = 0
		a.ScalarPacked[1] = 0
		a.Opening.Opening.KEM.CapsuleValid = 0
		a.Valid = 0
		// This is intentionally satisfiable even for a valid packet. Only the
		// consumer's EXHAUSTED receipt can authorize this placeholder as invalidity.
		solve(t, a, true)
		a.Valid = 1
		solve(t, a, false)
	})
	var base missionVector
	if err := json.Unmarshal(file.Vectors[0], &base); err != nil {
		t.Fatal(err)
	}
	mutations := map[string]func(*MissionV2Circuit){
		"old-version-domain-with-correct-digest": func(a *MissionV2Circuit) {
			encoded, err := hex.DecodeString(strings.TrimPrefix(base.ABI, "0x"))
			if err != nil {
				t.Fatal(err)
			}
			copy(encoded[:32], nativeKeccak([]byte("VENDETTA_OPENING_V1")))
			v := base
			v.ABI = "0x" + hex.EncodeToString(encoded)
			v.Statement = "0x" + hex.EncodeToString(nativeKeccak(encoded))
			ctx, err := contextAssignment(v)
			if err != nil {
				t.Fatal(err)
			}
			a.Context = ctx
		},
		"nonzero-plaintext-padding": func(a *MissionV2Circuit) {
			a.Opening.Opening.Age.PlainPacked[2] = new(big.Int).Add(a.Opening.Opening.Age.PlainPacked[2].(*big.Int), big.NewInt(1))
		},
		"substituted-pre": func(a *MissionV2Circuit) { a.PrePacked[0] = new(big.Int).Add(a.PrePacked[0].(*big.Int), big.NewInt(1)) },
		"substituted-context-digest": func(a *MissionV2Circuit) {
			a.Context.StatementPacked[0] = new(big.Int).Add(a.Context.StatementPacked[0].(*big.Int), big.NewInt(1))
		},
		"substituted-ciphertext-hash": func(a *MissionV2Circuit) {
			a.Opening.Opening.CiphertextHashPacked[0] = new(big.Int).Add(a.Opening.Opening.CiphertextHashPacked[0].(*big.Int), big.NewInt(1))
		},
		"substituted-round": func(a *MissionV2Circuit) { a.Opening.Opening.Round = 1001 },
		"high-packed-salt-bits": func(a *MissionV2Circuit) {
			a.Opening.Opening.Age.PlainPacked[2] = new(big.Int).Add(a.Opening.Opening.Age.PlainPacked[2].(*big.Int), new(big.Int).Lsh(big.NewInt(1), 128))
		},
	}
	for name, mutate := range mutations {
		t.Run(name, func(t *testing.T) { a, _ := assignment(t, file.Vectors[0]); mutate(a); solve(t, a, false) })
	}
}

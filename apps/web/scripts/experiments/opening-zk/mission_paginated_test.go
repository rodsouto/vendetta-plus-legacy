package main

import (
	"math/big"
	"path/filepath"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

func TestPaginatedMissionOpeningCircuit(t *testing.T) {
	vectors, err := readMissionVectors(missionInputPath())
	if err != nil {
		t.Fatal(err)
	}
	ages, err := readAgeVectors(ageInputPath())
	if err != nil {
		t.Fatal(err)
	}
	capsules, err := readCapsuleVectors(filepath.Join(filepath.Dir(ageInputPath()), "capsule-input.json"))
	if err != nil {
		t.Fatal(err)
	}
	ext, err := paginatedAssignment(capsules[0])
	if err != nil {
		t.Fatal(err)
	}
	first := joinedAssignment(t, ages[0])
	shape := &PaginatedMissionOpeningCircuit{Mission: MissionOpeningCircuit{Opening: AuthenticatedOpeningCircuit{Opening: *joinedShape(&first.Age)}, Message: messageShape(vectors[0]).Message}}
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, shape)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("paginated mission constraints=%d public inputs=%d", cs.GetNbConstraints(), cs.GetNbPublicVariables()-1)
	if cs.GetNbPublicVariables()-1 != 52 {
		t.Fatal("unexpected public input count")
	}
	solve := func(v missionVector, mutate func(*PaginatedMissionOpeningCircuit), expected bool) {
		t.Helper()
		ctx, err := contextAssignment(v)
		if err != nil {
			t.Fatal(err)
		}
		msg, err := messageWitness(v)
		if err != nil {
			t.Fatal(err)
		}
		a := &PaginatedMissionOpeningCircuit{Mission: MissionOpeningCircuit{Opening: AuthenticatedOpeningCircuit{Opening: *joinedAssignment(t, ages[0])}, Context: ctx, Message: msg, Valid: 1}, PrePacked: ext.PrePacked, ScalarPacked: ext.ScalarPacked}
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
	t.Run("valid", func(t *testing.T) { solve(vectors[0], nil, true) })
	t.Run("cannot-forfeit-valid", func(t *testing.T) {
		solve(vectors[0], func(a *PaginatedMissionOpeningCircuit) { a.Mission.Valid = 0 }, false)
	})
	t.Run("wrong-commitment", func(t *testing.T) {
		solve(vectors[1], func(a *PaginatedMissionOpeningCircuit) { a.Mission.Valid = 0 }, true)
	})
	t.Run("wrong-pre", func(t *testing.T) {
		solve(vectors[0], func(a *PaginatedMissionOpeningCircuit) {
			a.PrePacked[0] = new(big.Int).Add(a.PrePacked[0].(*big.Int), big.NewInt(1))
		}, false)
	})
	t.Run("wrong-context", func(t *testing.T) {
		solve(vectors[0], func(a *PaginatedMissionOpeningCircuit) {
			a.Mission.Context.StatementPacked[0] = new(big.Int).Add(a.Mission.Context.StatementPacked[0].(*big.Int), big.NewInt(1))
		}, false)
	})
	t.Run("wrong-beacon-round", func(t *testing.T) {
		solve(vectors[0], func(a *PaginatedMissionOpeningCircuit) { a.Mission.Opening.Opening.Round = 1001 }, false)
	})
}

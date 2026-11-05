package main

import (
	"encoding/json"
	"fmt"
	"github.com/consensys/gnark-crypto/ecc"
	fr "github.com/consensys/gnark-crypto/ecc/bn254/fr"
	"github.com/consensys/gnark/frontend"
	"os"
	"path/filepath"
	"testing"
)

func TestMissionV2ConsumerPublicSchema(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(filepath.Dir(ageInputPath()), "codec-v2", "vectors.json"))
	if err != nil {
		t.Fatal(err)
	}
	var input struct{ Vectors []json.RawMessage }
	if err = json.Unmarshal(data, &input); err != nil {
		t.Fatal(err)
	}
	a, _, err := missionV2Assignment(input.Vectors[1])
	if err != nil {
		t.Fatal(err)
	}
	witness, err := frontend.NewWitness(a, ecc.BN254.ScalarField(), frontend.PublicOnly())
	if err != nil {
		t.Fatal(err)
	}
	public := witness.Vector().(fr.Vector)
	o := &a.Opening.Opening
	var expected []frontend.Variable
	expected = append(expected, o.CiphertextHashPacked[:]...)
	expected = append(expected, o.KEM.SignaturePacked[:]...)
	expected = append(expected, o.KEM.CapsulePacked[:]...)
	expected = append(expected, o.KEM.FileKeyPacked, o.KEM.CapsuleValid, o.Age.FileKeyPacked)
	expected = append(expected, o.Age.HeaderPacked...)
	expected = append(expected, o.Age.MacPacked[:]...)
	expected = append(expected, o.Age.BodyPacked...)
	expected = append(expected, o.Age.PlainPacked...)
	expected = append(expected, o.Age.HeaderValid, o.Age.PayloadValid, o.Round)
	expected = append(expected, a.Context.StatementPacked[:]...)
	expected = append(expected, a.Valid)
	expected = append(expected, a.PrePacked[:]...)
	expected = append(expected, a.ScalarPacked[:]...)
	if len(public) != 55 || len(expected) != 55 {
		t.Fatal("consumer expects 55 public inputs")
	}
	for i := range expected {
		if public[i].String() != fmt.Sprint(expected[i]) {
			t.Fatalf("public input %d mismatches Solidity schema", i)
		}
	}
}

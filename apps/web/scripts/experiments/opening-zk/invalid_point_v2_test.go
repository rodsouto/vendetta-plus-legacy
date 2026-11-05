package main

import (
	"encoding/hex"
	"encoding/json"
	"math/big"
	"os"
	"path/filepath"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	bls "github.com/consensys/gnark-crypto/ecc/bls12-381"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

func TestInvalidPointMissionV2Circuit(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(filepath.Dir(ageInputPath()), "codec-v2", "vectors.json"))
	if err != nil {
		t.Fatal(err)
	}
	var file struct{ Vectors []json.RawMessage }
	if err = json.Unmarshal(data, &file); err != nil {
		t.Fatal(err)
	}
	var v missionVector
	var extra struct{ Packet string }
	for _, target := range []any{&v, &extra} {
		if err = json.Unmarshal(file.Vectors[0], target); err != nil {
			t.Fatal(err)
		}
	}
	original, err := hex.DecodeString(extra.Packet)
	if err != nil {
		t.Fatal(err)
	}
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &InvalidPointMissionV2Circuit{})
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("invalid point mission constraints=%d public inputs=%d", cs.GetNbConstraints(), cs.GetNbPublicVariables()-1)
	if cs.GetNbPublicVariables()-1 != 2 {
		t.Fatal("unexpected public schema")
	}
	solve := func(t *testing.T, packet []byte, rebind bool, expected bool, poisonPadding bool) {
		t.Helper()
		a, err := invalidPointV2Assignment(v, packet, rebind)
		if err != nil {
			t.Fatal(err)
		}
		if poisonPadding {
			a.PacketPacked[17] = new(big.Int).Add(a.PacketPacked[17].(*big.Int), big.NewInt(1))
		}
		w, err := frontend.NewWitness(a, ecc.BN254.ScalarField())
		if err != nil {
			t.Fatal(err)
		}
		err = cs.IsSolved(w)
		if (err == nil) != expected {
			t.Fatalf("expected satisfiable=%v got %v", expected, err)
		}
	}
	t.Run("cannot-invalidate-valid-packet", func(t *testing.T) { solve(t, original, false, false, false) })
	bad := append([]byte(nil), original...)
	bad[44] &= 127
	t.Run("invalid-compression-flag", func(t *testing.T) { solve(t, bad, true, true, false) })
	t.Run("cannot-substitute-bytes-under-original-statement", func(t *testing.T) { solve(t, bad, false, false, false) })
	var inf bls.G2Affine
	encoded := inf.Bytes()
	identity := append([]byte(nil), original...)
	copy(identity[44:140], encoded[:])
	t.Run("identity-U", func(t *testing.T) { solve(t, identity, true, true, false) })
	wrongNetwork := append([]byte(nil), bad...)
	wrongNetwork[4] ^= 1
	t.Run("wrong-network-is-not-admitted-v2-framing", func(t *testing.T) { solve(t, wrongNetwork, true, false, false) })

	t.Run("nonzero-packed-padding", func(t *testing.T) { solve(t, bad, true, false, true) })
	pointData, err := os.ReadFile(filepath.Join(filepath.Dir(ageInputPath()), "invalid-point", "vectors.json"))
	if err != nil {
		t.Fatal(err)
	}
	var pointFile struct {
		Vectors []struct {
			Name    string
			Encoded string
		}
	}
	if err = json.Unmarshal(pointData, &pointFile); err != nil {
		t.Fatal(err)
	}
	selected := map[string]bool{"noncanonical-0": true, "nonsquare-x": true, "on-curve-outside-subgroup": true, "order-13-torsion": true, "order-23-torsion": true}
	for _, point := range pointFile.Vectors {
		if !selected[point.Name] {
			continue
		}
		delete(selected, point.Name)
		t.Run(point.Name, func(t *testing.T) {
			bytes, err := hex.DecodeString(point.Encoded)
			if err != nil {
				t.Fatal(err)
			}
			packet := append([]byte(nil), original...)
			copy(packet[44:140], bytes)
			solve(t, packet, true, true, false)
		})
	}
	if len(selected) != 0 {
		t.Fatal("missing point boundary vectors")
	}
}

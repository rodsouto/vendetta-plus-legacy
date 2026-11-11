package main

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	bls "github.com/consensys/gnark-crypto/ecc/bls12-381"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
	curve "github.com/consensys/gnark/std/algebra/emulated/sw_bls12381"
	"github.com/consensys/gnark/std/math/emulated"
	"github.com/consensys/gnark/std/math/uints"
)

type gt576Circuit struct {
	Capsule CapsuleCircuit
	Bytes   [576]uints.U8
}

func (c *gt576Circuit) Define(api frontend.API) error {
	// Exercise the actual KEM, including its pairing and H2 serialization, too.
	if err := c.Capsule.Define(api); err != nil {
		return err
	}
	p, err := curve.NewPairing(api)
	if err != nil {
		return err
	}
	f, err := emulated.NewField[curve.BaseField](api)
	if err != nil {
		return err
	}
	u, err := uints.NewBytes(api)
	if err != nil {
		return err
	}
	tower := p.ToTower(&c.Capsule.Pair.GT)
	for i := 0; i < 12; i++ {
		encoded := fieldBytes(api, f, u, tower[11-i])
		for j := range encoded {
			u.AssertIsEqual(encoded[j], c.Bytes[i*48+j])
		}
	}
	return nil
}

func TestGT576ClientCircuitProducer(t *testing.T) {
	vectors, err := readCapsuleVectors(filepath.Join(filepath.Dir(ageInputPath()), "capsule-input.json"))
	if err != nil {
		t.Fatal(err)
	}
	// Run the client's pinned noble/tlock-js implementation, not a supplied GT fixture.
	// pnpm install is required; a missing runtime is a failure, never a skip.
	cmd := exec.Command("node", "--input-type=module", "-e", `
import { createRequire } from 'node:module';
import { bls12_381 as bls } from '@noble/curves/bls12-381';
const { fp12ToBytes } = createRequire(import.meta.url)('tlock-js/crypto/utils');
const v = JSON.parse(process.argv[1]);
const gt = bls.pairing(bls.G1.ProjectivePoint.fromHex(v.signature), bls.G2.ProjectivePoint.fromHex(v.capsule.slice(0, 192)));
process.stdout.write(Buffer.from(fp12ToBytes(gt)).toString('hex'));
`, string(mustJSON(t, vectors[0])))
	cmd.Dir = filepath.Join("..", "..", "..")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("client pairing: %v: %s", err, output)
	}
	want, err := hex.DecodeString(string(output))
	if err != nil || len(want) != 576 {
		t.Fatalf("client GT576 encoding: %v, bytes=%d", err, len(want))
	}
	v := vectors[0]
	var sig bls.G1Affine
	var point bls.G2Affine
	if _, err = sig.SetBytes(decodeHex(t, v.Signature)); err != nil {
		t.Fatal(err)
	}
	if _, err = point.SetBytes(decodeHex(t, v.Capsule)[:96]); err != nil {
		t.Fatal(err)
	}
	gt, err := bls.Pair([]bls.G1Affine{sig}, []bls.G2Affine{point})
	if err != nil {
		t.Fatal(err)
	}
	producerBytes := gt.Bytes() // Same native API used in prepareProducer.
	if !bytes.Equal(want, producerBytes[:]) {
		t.Fatal("client/producer GT576 mismatch")
	}
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &gt576Circuit{})
	if err != nil {
		t.Fatal(err)
	}
	cap, err := capsuleAssignment(v)
	if err != nil {
		t.Fatal(err)
	}
	a := &gt576Circuit{Capsule: *cap}
	copy(a.Bytes[:], uints.NewU8Array(want))
	for _, corrupt := range []bool{false, true} {
		if corrupt {
			// Last byte of a non-leading Fp limb detects partial/first-limb comparisons.
			a.Bytes[335] = uints.NewU8(want[335] ^ 1)
		}
		w, err := frontend.NewWitness(a, ecc.BN254.ScalarField())
		if err != nil {
			t.Fatal(err)
		}
		if err = cs.IsSolved(w); (err == nil) == corrupt {
			t.Fatalf("GT576 corrupt=%v: %v", corrupt, err)
		}
	}
}

func mustJSON(t *testing.T, value any) []byte {
	t.Helper()
	b, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

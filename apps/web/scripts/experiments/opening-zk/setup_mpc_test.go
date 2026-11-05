package main

import (
	"bytes"
	"io"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	"github.com/consensys/gnark/backend/solidity"
	cs "github.com/consensys/gnark/constraint/bn254"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

// This circuit only checks backend interoperability. It is not a game circuit
// or a ceremony: all contributions run in this test process with fixed beacons.
type setupMPCTestCircuit struct {
	X frontend.Variable
	Y frontend.Variable `gnark:",public"`
}

func (c *setupMPCTestCircuit) Define(api frontend.API) error {
	x2 := api.Mul(c.X, c.X)
	api.AssertIsEqual(api.Mul(x2, x2), c.Y)
	// Exercise commitment keys as well as ordinary Groth16 keys; emulated
	// arithmetic gadgets can introduce commitments in larger game circuits.
	commitment, err := api.(frontend.Committer).Commit(c.X, c.Y)
	if err != nil {
		return err
	}
	api.AssertIsDifferent(commitment, 0)
	return nil
}

func TestSetupMPCCompatibility(t *testing.T) {
	encode := func(v io.WriterTo) []byte {
		t.Helper()
		var b bytes.Buffer
		if _, err := v.WriteTo(&b); err != nil {
			t.Fatal(err)
		}
		return b.Bytes()
	}
	decode := func(v io.ReaderFrom, b []byte) {
		t.Helper()
		n, err := v.ReadFrom(bytes.NewReader(b))
		if err != nil || n != int64(len(b)) {
			t.Fatalf("transcript decode: %d/%d bytes, %v", n, len(b), err)
		}
	}
	compiled, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &setupMPCTestCircuit{})
	if err != nil {
		t.Fatal(err)
	}
	ccs := compiled.(*cs.R1CS)
	domain := ecc.NextPowerOfTwo(uint64(ccs.GetNbConstraints()))

	p1 := mpcsetup.NewPhase1(domain)
	var transcript1 [][]byte
	for range 2 {
		p1.Contribute()
		transcript1 = append(transcript1, encode(p1))
	}
	readPhase1 := func() []*mpcsetup.Phase1 {
		out := make([]*mpcsetup.Phase1, len(transcript1))
		for i, b := range transcript1 {
			out[i] = new(mpcsetup.Phase1)
			decode(out[i], b)
		}
		return out
	}
	// The API mutates the last contribution during sealing; every verification
	// must start from fresh decoded transcript bytes.
	beacon1, beacon2 := []byte("local test phase1"), []byte("local test phase2")
	commons, err := mpcsetup.VerifyPhase1(domain, beacon1, readPhase1()...)
	if err != nil {
		t.Fatal(err)
	}
	t.Run("phase1-challenge-tamper", func(t *testing.T) {
		bad := readPhase1()
		bad[1].Challenge[0] ^= 1
		if _, err := mpcsetup.VerifyPhase1(domain, beacon1, bad...); err == nil {
			t.Fatal("accepted altered phase1 transcript")
		}
	})

	p2 := new(mpcsetup.Phase2)
	p2.Initialize(ccs, &commons)
	var transcript2 [][]byte
	for range 2 {
		p2.Contribute()
		transcript2 = append(transcript2, encode(p2))
	}
	readPhase2 := func() []*mpcsetup.Phase2 {
		out := make([]*mpcsetup.Phase2, len(transcript2))
		for i, b := range transcript2 {
			out[i] = new(mpcsetup.Phase2)
			decode(out[i], b)
		}
		return out
	}
	t.Run("phase2-challenge-tamper", func(t *testing.T) {
		bad := readPhase2()
		bad[1].Challenge[0] ^= 1
		if _, _, err := mpcsetup.VerifyPhase2(ccs, &commons, beacon2, bad...); err == nil {
			t.Fatal("accepted altered phase2 transcript")
		}
	})
	pk, vk, err := mpcsetup.VerifyPhase2(ccs, &commons, beacon2, readPhase2()...)
	if err != nil {
		t.Fatal(err)
	}
	pkAgain, vkAgain, err := mpcsetup.VerifyPhase2(ccs, &commons, beacon2, readPhase2()...)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(encode(pk), encode(pkAgain)) || !bytes.Equal(encode(vk), encode(vkAgain)) {
		t.Fatal("same transcript and beacons produced different keys")
	}
	// Exercise the same artifact encoding and Solidity exporter as the producer.
	loadedPK, loadedVK := groth16.NewProvingKey(ecc.BN254), groth16.NewVerifyingKey(ecc.BN254)
	decode(loadedPK, encode(pk))
	decode(loadedVK, encode(vk))
	var exported bytes.Buffer
	if err := loadedVK.ExportSolidity(&exported); err != nil || exported.Len() == 0 {
		t.Fatalf("Solidity export: %v", err)
	}
	witness, err := frontend.NewWitness(&setupMPCTestCircuit{X: 3, Y: 81}, ecc.BN254.ScalarField())
	if err != nil {
		t.Fatal(err)
	}
	proof, err := groth16.Prove(ccs, loadedPK, witness, solidity.WithProverTargetSolidityVerifier(backend.GROTH16))
	if err != nil {
		t.Fatal(err)
	}
	public, err := witness.Public()
	if err != nil {
		t.Fatal(err)
	}
	if err := groth16.Verify(proof, loadedVK, public, solidity.WithVerifierTargetSolidityVerifier(backend.GROTH16)); err != nil {
		t.Fatal(err)
	}
	wrong, err := frontend.NewWitness(&setupMPCTestCircuit{X: 3, Y: 80}, ecc.BN254.ScalarField(), frontend.PublicOnly())
	if err != nil {
		t.Fatal(err)
	}
	if err := groth16.Verify(proof, loadedVK, wrong, solidity.WithVerifierTargetSolidityVerifier(backend.GROTH16)); err == nil {
		t.Fatal("accepted proof with substituted public input")
	}
}

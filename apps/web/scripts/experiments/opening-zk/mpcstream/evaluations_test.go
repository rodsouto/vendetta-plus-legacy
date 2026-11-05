package mpcstream

import (
	"bytes"
	"encoding/binary"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	native "github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	cs "github.com/consensys/gnark/constraint/bn254"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
	"vendetta-opening-pairing-experiment/mpcinspect"
)

type evalCircuit struct {
	X      frontend.Variable
	Y      frontend.Variable `gnark:",public"`
	Commit bool              `gnark:"-"`
}

func (c *evalCircuit) Define(api frontend.API) error {
	x := api.Mul(c.X, c.X)
	api.AssertIsEqual(api.Mul(x, x), c.Y)
	if c.Commit {
		v, err := api.(frontend.Committer).Commit(c.X, c.Y)
		if err != nil {
			return err
		}
		api.AssertIsDifferent(v, 0)
	}
	return nil
}
func TestEvaluationCacheAndInitialState(t *testing.T) {
	for _, commit := range []bool{false, true} {
		compiled, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &evalCircuit{Commit: commit})
		if err != nil {
			t.Fatal(err)
		}
		ccs := compiled.(*cs.R1CS)
		n := ecc.NextPowerOfTwo(uint64(ccs.GetNbConstraints()))
		if n < 2 {
			n = 2
		}
		p1 := native.NewPhase1(n)
		p1.Contribute()
		commons := p1.Seal([]byte("test-only"))
		p2 := new(native.Phase2)
		evals := p2.Initialize(ccs, &commons)
		policy, err := EvaluationShapeFromCS(ccs)
		if err != nil {
			t.Fatal(err)
		}
		var cache bytes.Buffer
		if _, err := WriteEvaluations(&cache, &evals); err != nil {
			t.Fatal(err)
		}
		loaded, err := ReadEvaluations(bytes.NewReader(cache.Bytes()), policy, digest(cache.Bytes()), 1<<20, 1<<20)
		if err != nil {
			t.Fatal(err)
		}
		var roundtrip bytes.Buffer
		if _, err := WriteEvaluations(&roundtrip, &loaded); err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(roundtrip.Bytes(), cache.Bytes()) {
			t.Fatal("evaluation bytes changed")
		}
		shape, err := mpcinspect.ShapeFromCS(ccs, digest(encoded(t, ccs)), 2)
		if err != nil {
			t.Fatal(err)
		}
		initial := encoded(t, p2)
		if _, err := mpcinspect.Decode(bytes.NewReader(initial), shape, digest(initial), 1<<20, 1<<20); err == nil {
			t.Fatal("initial state accepted as contribution")
		}
		decoded, err := mpcinspect.DecodeInitialPhase2(bytes.NewReader(initial), shape, digest(initial), 1<<20, 1<<20)
		if err != nil {
			t.Fatal(err)
		}
		decoded.Phase2.Contribute()
		first := encoded(t, decoded.Phase2)
		decoded.Phase2.Contribute()
		second := encoded(t, decoded.Phase2)
		fresh := func(raw []byte) *native.Phase2 {
			value, err := mpcinspect.Decode(bytes.NewReader(raw), shape, digest(raw), 1<<20, 1<<20)
			if err != nil {
				t.Fatal(err)
			}
			return value.Phase2
		}
		pk, vk, err := native.VerifyPhase2(ccs, &commons, []byte("phase2-test-only"), fresh(first), fresh(second))
		if err != nil {
			t.Fatal(err)
		}
		otherPK, otherVK := fresh(second).Seal(&commons, &loaded, []byte("phase2-test-only"))
		if !bytes.Equal(encoded(t, pk), encoded(t, otherPK)) || !bytes.Equal(encoded(t, vk), encoded(t, otherVK)) {
			t.Fatal("cached evaluations change derived keys")
		}
		bad := append([]byte{}, cache.Bytes()...)
		binary.BigEndian.PutUint32(bad[10:14], ^uint32(0))
		if _, err := ReadEvaluations(bytes.NewReader(bad), policy, digest(bad), 1<<20, 1<<20); err == nil {
			t.Fatal("evaluation length bomb accepted")
		}
	}
}

package mpcstream

import (
	"bytes"
	"encoding/binary"
	"testing"

	native "github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
)

func TestSealedCommonsGuard(t *testing.T) {
	p := native.NewPhase1(8)
	p.Contribute()
	c := p.Seal([]byte("unsafe-test"))
	raw := encoded(t, &c)
	decoded, err := ReadCommons(bytes.NewReader(raw), 8, digest(raw), 1<<20, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(encoded(t, &decoded), raw) {
		t.Fatal("sealed commons changed")
	}
	for _, mutate := range []func([]byte) []byte{
		func(b []byte) []byte { binary.BigEndian.PutUint64(b, ^uint64(0)); return b },
		func(b []byte) []byte { b[8] &= 0x3f; return b },
		func(b []byte) []byte { return b[:len(b)-1] },
		func(b []byte) []byte { return append(b, 0) },
	} {
		b := mutate(append([]byte{}, raw...))
		if _, err := ReadCommons(bytes.NewReader(b), 8, digest(b), 1<<20, 1<<20); err == nil {
			t.Fatal("bad sealed commons accepted")
		}
	}
}

func TestSealCommonsRetainsOnlyNativeSealInputs(t *testing.T) {
	p := native.NewPhase1(16)
	p.Contribute()
	c := p.Seal([]byte("unsafe-test"))
	body := encoded(t, &c)
	selected, err := ReadSealCommons(bytes.NewReader(body), 16, digest(body), 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	if len(selected.G1.AlphaTau) != 16 || len(selected.G1.BetaTau) != 1 || len(selected.G1.Tau) != 0 || len(selected.G2.Tau) != 0 || !selected.G1.AlphaTau[0].Equal(&c.G1.AlphaTau[0]) || !selected.G1.BetaTau[0].Equal(&c.G1.BetaTau[0]) || !selected.G2.Beta.Equal(&c.G2.Beta) {
		t.Fatal("seal inputs differ")
	}
	for _, mutation := range []func([]byte) []byte{
		func(b []byte) []byte { b[len(b)-1] ^= 1; return b },
		func(b []byte) []byte { return b[:len(b)-1] },
		func(b []byte) []byte { return append(b, 0) },
	} {
		changed := mutation(append([]byte{}, body...))
		if _, err = ReadSealCommons(bytes.NewReader(changed), 16, digest(body), 1<<20); err == nil {
			t.Fatal("mutated/partial commons accepted")
		}
	}
}

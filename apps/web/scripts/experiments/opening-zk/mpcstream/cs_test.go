package mpcstream

import (
	"bytes"
	"encoding/binary"
	"strings"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

type csCircuit struct {
	X frontend.Variable
	Y frontend.Variable `gnark:",public"`
}

func (c *csCircuit) Define(api frontend.API) error {
	x := c.X
	for range 7 {
		x = api.Mul(x, x)
	}
	api.AssertIsEqual(x, c.Y)
	return nil
}
func TestPinnedCompiledCSRead(t *testing.T) {
	c, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &csCircuit{})
	if err != nil {
		t.Fatal(err)
	}
	raw := encoded(t, c)
	read, err := ReadCompiledCS(bytes.NewReader(raw), digest(raw), 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	if read.GetNbConstraints() != c.GetNbConstraints() || !bytes.Equal(encoded(t, read), raw) {
		t.Fatal("compiled CS changed")
	}
	for name, mutate := range map[string]func([]byte) []byte{
		"length-bomb": func(b []byte) []byte { binary.LittleEndian.PutUint64(b, ^uint64(0)); return b },
		"version":     func(b []byte) []byte { binary.LittleEndian.PutUint64(b[24:], 5); return b },
		"truncated":   func(b []byte) []byte { return b[:len(b)-1] },
	} {
		t.Run(name, func(t *testing.T) {
			b := mutate(append([]byte{}, raw...))
			if object, err := ReadCompiledCS(bytes.NewReader(b), digest(b), 1<<20); err == nil || object != nil {
				t.Fatal("bad CS accepted")
			}
		})
	}
	if object, err := ReadCompiledCS(bytes.NewReader(raw), strings.Repeat("0", 64), 1<<20); err == nil || object != nil {
		t.Fatal("wrong CS digest accepted")
	}
}

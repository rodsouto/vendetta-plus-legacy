// Package mpcrehearsal exercises only a fixed tiny test circuit. It cannot load
// game circuits or produce an approved production setup.
package mpcrehearsal

import (
	"bytes"
	"encoding/binary"
	"errors"
	"io"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	cs "github.com/consensys/gnark/constraint/bn254"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
	"vendetta-opening-pairing-experiment/mpcinspect"
)

type toyCircuit struct {
	X frontend.Variable
	Y frontend.Variable `gnark:",public"`
}

func (c *toyCircuit) Define(api frontend.API) error {
	x2 := api.Mul(c.X, c.X)
	api.AssertIsEqual(api.Mul(x2, x2), c.Y)
	commitment, err := api.(frontend.Committer).Commit(c.X, c.Y)
	if err != nil {
		return err
	}
	api.AssertIsDifferent(commitment, 0)
	return nil
}
func compile() (*cs.R1CS, uint64, error) {
	compiled, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &toyCircuit{})
	if err != nil {
		return nil, 0, err
	}
	c := compiled.(*cs.R1CS)
	n := ecc.NextPowerOfTwo(uint64(c.GetNbConstraints()))
	if n < 2 || n > 1024 {
		return nil, 0, errors.New("rehearsal circuit exceeds fixed small domain")
	}
	return c, n, nil
}
func encodeNative(value io.WriterTo) ([]byte, error) {
	var b bytes.Buffer
	_, err := value.WriteTo(&b)
	return b.Bytes(), err
}

// cursor inspects native allocation-driving fields BEFORE any native ReadFrom.
// This grammar is pinned to gnark v0.16.4 / gnark-crypto's compressed BN254 format.
// It deliberately rejects raw/uncompressed variants, even if upstream accepts them.
type cursor struct {
	data []byte
	off  int
	err  error
}

func (c *cursor) take(n int) []byte {
	if c.err != nil {
		return nil
	}
	if n < 0 || n > len(c.data)-c.off {
		c.err = io.ErrUnexpectedEOF
		return nil
	}
	b := c.data[c.off : c.off+n]
	c.off += n
	return b
}
func (c *cursor) point(size int) {
	b := c.take(size)
	if c.err == nil && b[0]&0xc0 == 0 {
		c.err = errors.New("uncompressed point is not accepted")
	}
}
func (c *cursor) points(count int, size int) {
	for i := 0; i < count && c.err == nil; i++ {
		c.point(size)
	}
}
func (c *cursor) slice(count int) {
	b := c.take(4)
	if c.err != nil {
		return
	}
	if uint64(binary.BigEndian.Uint32(b)) != uint64(count) {
		c.err = errors.New("native vector length does not match trusted shape")
		return
	}
	c.points(count, 32)
}
func (c *cursor) proof() { c.point(32); c.point(64) }
func (c *cursor) finish() error {
	b := c.take(1)
	if c.err == nil && b[0] != 32 {
		c.err = errors.New("contribution requires a 32-byte native challenge")
	}
	c.take(32)
	if c.err != nil {
		return c.err
	}
	if c.off != len(c.data) {
		return errors.New("trailing native transcript bytes")
	}
	return nil
}
func preflight1(data []byte, n uint64) error {
	if n < 2 || n > 1024 || len(data) != int(192*n+265) {
		return errors.New("phase one size/domain mismatch")
	}
	c := cursor{data: data}
	for range 3 {
		c.proof()
	}
	b := c.take(8)
	if c.err != nil {
		return c.err
	}
	if binary.BigEndian.Uint64(b) != n {
		return errors.New("native phase one domain mismatch")
	}
	c.point(64)
	c.points(int(2*n-2), 32)
	c.points(int(n-1), 64)
	c.points(int(2*n), 32)
	return c.finish()
}
func preflight2(data []byte, shape *mpcsetup.Phase2) error {
	if len(data) > MaxNativeBytes {
		return errors.New("native transcript too large")
	}
	c := cursor{data: data}
	b := c.take(2)
	if c.err != nil {
		return c.err
	}
	commitments := len(shape.Parameters.G2.Sigma)
	if int(binary.BigEndian.Uint16(b)) != commitments {
		return errors.New("native commitment count mismatch")
	}
	c.point(32)
	c.slice(len(shape.Parameters.G1.PKK))
	c.slice(len(shape.Parameters.G1.Z))
	c.point(64)
	for _, s := range shape.Parameters.G1.SigmaCKK {
		c.slice(len(s))
	}
	c.points(commitments, 64)
	for i := 0; i <= commitments; i++ {
		c.proof()
	}
	return c.finish()
}
func nativeShape(circuitSHA256 string, n uint64, phase2 *mpcsetup.Phase2) mpcinspect.Shape {
	s := mpcinspect.Shape{Schema: "vendetta-hidden-v2-native-shape-1", CircuitSHA256: circuitSHA256, Domain: n, Phase: 1, PrivateCommitted: []uint64{}}
	if phase2 != nil {
		s.Phase = 2
		s.Private = uint64(len(phase2.Parameters.G1.PKK))
		for _, points := range phase2.Parameters.G1.SigmaCKK {
			s.PrivateCommitted = append(s.PrivateCommitted, uint64(len(points)))
		}
	}
	return s
}

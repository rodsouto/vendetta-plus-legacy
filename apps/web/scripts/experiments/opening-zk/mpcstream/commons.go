package mpcstream

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	curve "github.com/consensys/gnark-crypto/ecc/bn254"
	"io"

	native "github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	"vendetta-opening-pairing-experiment/mpcinspect"
)

func ReadCommons(r io.Reader, n uint64, pin string, maxWire, maxPoints uint64) (native.SrsCommons, error) {
	var empty native.SrsCommons
	g, err := mpcinspect.NewCommonsGuard(r, n, pin, maxWire)
	if err != nil {
		return empty, err
	}
	points := (4*n-1)*64 + (n+1)*128
	if maxPoints == 0 || points > maxPoints {
		return empty, errors.New("sealed commons point budget exceeded")
	}
	c := new(native.SrsCommons)
	size, err := c.ReadFrom(g)
	if err != nil {
		return empty, err
	}
	if uint64(size) != 192*n-56 {
		return empty, errors.New("sealed commons length differs")
	}
	if err := g.Finish(); err != nil {
		return empty, err
	}
	h := sha256.New()
	size, err = c.WriteTo(h)
	if err != nil {
		return empty, err
	}
	if uint64(size) != 192*n-56 || hex.EncodeToString(h.Sum(nil)) != pin {
		return empty, errors.New("sealed commons serialization differs")
	}
	return *c, nil
}

// ReadSealCommons retains precisely the fields read by gnark v0.16.4 Phase2.Seal:
// alpha[0], beta[0], betaG2 and len(alpha). Remaining points are streamed through
// the pinned commons guard. The result is ONLY for Seal, never Initialize or
// Phase1 verification. The alpha slice preserves the native FFT domain length.
func ReadSealCommons(r io.Reader, n uint64, pin string, maxWire uint64) (native.SrsCommons, error) {
	var empty native.SrsCommons
	g, err := mpcinspect.NewCommonsGuard(r, n, pin, maxWire)
	if err != nil {
		return empty, err
	}
	var domain uint64
	if err = binary.Read(g, binary.BigEndian, &domain); err != nil {
		return empty, err
	}
	if domain != n {
		return empty, errors.New("seal commons domain differs")
	}
	var c native.SrsCommons
	dec := curve.NewDecoder(g)
	if err = dec.Decode(&c.G2.Beta); err != nil {
		return empty, err
	}
	if _, err = io.CopyN(io.Discard, g, int64(32*(2*n-2)+64*(n-1))); err != nil {
		return empty, err
	}
	c.G1.BetaTau = make([]curve.G1Affine, 1)
	if err = dec.Decode(&c.G1.BetaTau[0]); err != nil {
		return empty, err
	}
	if _, err = io.CopyN(io.Discard, g, int64(32*(n-1))); err != nil {
		return empty, err
	}
	c.G1.AlphaTau = make([]curve.G1Affine, n)
	if err = dec.Decode(&c.G1.AlphaTau[0]); err != nil {
		return empty, err
	}
	if _, err = io.CopyN(io.Discard, g, int64(32*(n-1))); err != nil {
		return empty, err
	}
	if err = g.Finish(); err != nil {
		return empty, err
	}
	return c, nil
}

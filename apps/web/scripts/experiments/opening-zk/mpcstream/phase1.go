// Package mpcstream adapts the pinned native MPC verifier to retain one SRS.
// It checks the same native proofs and ratios; it never approves production.
package mpcstream

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"io"
	"runtime"
	"runtime/debug"

	curve "github.com/consensys/gnark-crypto/ecc/bn254"
	crypto "github.com/consensys/gnark-crypto/ecc/bn254/mpcsetup"
	native "github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	gio "github.com/consensys/gnark/io"
	"vendetta-opening-pairing-experiment/mpcinspect"
)

type Anchor struct {
	Schema  string `json:"schema"`
	Domain  uint64 `json:"domain"`
	SHA256  string `json:"sha256"`
	TauG1   string `json:"tauG1"`
	AlphaG1 string `json:"alphaG1"`
	BetaG1  string `json:"betaG1"`
	BetaG2  string `json:"betaG2"`
}

func g1hex(p curve.G1Affine) string { b := p.Bytes(); return hex.EncodeToString(b[:]) }
func g2hex(p curve.G2Affine) string { b := p.Bytes(); return hex.EncodeToString(b[:]) }
func repeated(w io.Writer, p []byte, count uint64) error {
	var block [32768]byte
	for off := 0; off < len(block); off += len(p) {
		copy(block[off:], p)
	}
	n := count * uint64(len(p))
	for n > 0 {
		take := uint64(len(block))
		if take > n {
			take = n
		}
		written, err := w.Write(block[:int(take)])
		if err != nil {
			return err
		}
		if written != int(take) {
			return io.ErrShortWrite
		}
		n -= take
	}
	return nil
}

// InitialAnchor hashes the exact known native initial encoding without allocating
// N point arrays. This replaces only hashing/storage, not a cryptographic check.
func InitialAnchor(n uint64) (Anchor, error) {
	if n < 2 || n > mpcinspect.MaxDomain || n&(n-1) != 0 {
		return Anchor{}, errors.New("invalid initial domain")
	}
	h := sha256.New()
	for range 3 {
		if _, err := new(crypto.UpdateProof).WriteTo(h); err != nil {
			return Anchor{}, err
		}
	}
	if err := binary.Write(h, binary.BigEndian, n); err != nil {
		return Anchor{}, err
	}
	_, _, g1, g2 := curve.Generators()
	one := g1.Bytes()
	two := g2.Bytes()
	if _, err := h.Write(two[:]); err != nil {
		return Anchor{}, err
	}
	for _, s := range []struct {
		p     []byte
		count uint64
	}{{one[:], 2*n - 2}, {two[:], n - 1}, {one[:], 2 * n}} {
		if err := repeated(h, s.p, s.count); err != nil {
			return Anchor{}, err
		}
	}
	if _, err := gio.WriteBytesShort(nil, h); err != nil {
		return Anchor{}, err
	}
	return Anchor{"vendetta-local-phase1-anchor-1", n, hex.EncodeToString(h.Sum(nil)), g1hex(g1), g1hex(g1), g1hex(g1), g2hex(g2)}, nil
}

type transcript struct {
	proofs    [3]crypto.UpdateProof
	commons   native.SrsCommons
	challenge []byte
}

func (t *transcript) WriteTo(w io.Writer) (int64, error) {
	var total int64
	for i := range t.proofs {
		n, err := t.proofs[i].WriteTo(w)
		total += n
		if err != nil {
			return total, err
		}
	}
	n, err := t.commons.WriteTo(w)
	total += n
	if err != nil {
		return total, err
	}
	n, err = gio.WriteBytesShort(t.challenge, w)
	return total + n, err
}
func read(r io.Reader, shape mpcinspect.Shape, pin string, maxWire, maxPoints uint64) (*transcript, error) {
	if shape.Phase != 1 {
		return nil, errors.New("phase one shape required")
	}
	points, err := shape.PointPayloadBytes()
	if err != nil {
		return nil, err
	}
	if maxPoints == 0 || points > maxPoints {
		return nil, errors.New("point payload exceeds budget")
	}
	g, err := mpcinspect.NewGuard(r, shape, pin, maxWire)
	if err != nil {
		return nil, err
	}
	t := new(transcript)
	for i := range t.proofs {
		if _, err := t.proofs[i].ReadFrom(g); err != nil {
			return nil, err
		}
	}
	if _, err := t.commons.ReadFrom(g); err != nil {
		return nil, err
	}
	challenge, _, err := gio.ReadBytesShort(g)
	if err != nil {
		return nil, err
	}
	t.challenge = challenge
	if err := g.Finish(); err != nil {
		return nil, err
	}
	h := sha256.New()
	n, err := t.WriteTo(h)
	if err != nil {
		return nil, err
	}
	size, err := shape.Size()
	if err != nil {
		return nil, err
	}
	if uint64(n) != size || hex.EncodeToString(h.Sum(nil)) != pin {
		return nil, errors.New("noncanonical native transcript")
	}
	return t, nil
}
func point1(s string) (curve.G1Affine, error) {
	var p curve.G1Affine
	b, err := hex.DecodeString(s)
	if err != nil || len(b) != 32 || hex.EncodeToString(b) != s {
		return p, errors.New("bad anchor G1 encoding")
	}
	if _, err = p.SetBytes(b); err != nil {
		return p, err
	}
	if p.IsInfinity() || g1hex(p) != s {
		return p, errors.New("invalid anchor G1")
	}
	return p, nil
}
func point2(s string) (curve.G2Affine, error) {
	var p curve.G2Affine
	b, err := hex.DecodeString(s)
	if err != nil || len(b) != 64 || hex.EncodeToString(b) != s {
		return p, errors.New("bad anchor G2 encoding")
	}
	if _, err = p.SetBytes(b); err != nil {
		return p, err
	}
	if p.IsInfinity() || g2hex(p) != s {
		return p, errors.New("invalid anchor G2")
	}
	return p, nil
}

// VerifyTransition requires an anchor from InitialAnchor or a prior verified step.
// A caller-supplied anchor alone does not authenticate an earlier history.
func VerifyTransition(r io.Reader, shape mpcinspect.Shape, pin string, previous Anchor, maxWire, maxPoints uint64) (native.SrsCommons, Anchor, error) {
	var empty native.SrsCommons
	if previous.Schema != "vendetta-local-phase1-anchor-1" || previous.Domain != shape.Domain {
		return empty, Anchor{}, errors.New("cross-domain anchor")
	}
	challenge, err := hex.DecodeString(previous.SHA256)
	if err != nil || len(challenge) != 32 || hex.EncodeToString(challenge) != previous.SHA256 {
		return empty, Anchor{}, errors.New("bad anchor digest")
	}
	tau, err := point1(previous.TauG1)
	if err != nil {
		return empty, Anchor{}, err
	}
	alpha, err := point1(previous.AlphaG1)
	if err != nil {
		return empty, Anchor{}, err
	}
	beta1, err := point1(previous.BetaG1)
	if err != nil {
		return empty, Anchor{}, err
	}
	beta2, err := point2(previous.BetaG2)
	if err != nil {
		return empty, Anchor{}, err
	}
	t, err := read(r, shape, pin, maxWire, maxPoints)
	if err != nil {
		return empty, Anchor{}, err
	}
	if !bytes.Equal(t.challenge, challenge) {
		return empty, Anchor{}, errors.New("native previous challenge mismatch")
	}
	c := &t.commons
	if err := t.proofs[0].Verify(challenge, native.DST_TAU, crypto.ValueUpdate{Previous: &tau, Next: &c.G1.Tau[1]}); err != nil {
		return empty, Anchor{}, err
	}
	if err := t.proofs[1].Verify(challenge, native.DST_ALPHA, crypto.ValueUpdate{Previous: alpha, Next: c.G1.AlphaTau[0]}); err != nil {
		return empty, Anchor{}, err
	}
	if err := t.proofs[2].Verify(challenge, native.DST_BETA, crypto.ValueUpdate{Previous: &beta1, Next: &c.G1.BetaTau[0]}, crypto.ValueUpdate{Previous: &beta2, Next: &c.G2.Beta}); err != nil {
		return empty, Anchor{}, err
	}
	// Canonical decoding/hashing creates transient buffers. Release them before
	// native batching allocates full point copies and scalar vectors.
	runtime.GC()
	debug.FreeOSMemory()
	if err := crypto.SameRatioMany(c.G1.Tau, c.G2.Tau, c.G1.AlphaTau, c.G1.BetaTau); err != nil {
		return empty, Anchor{}, err
	}
	anchor := Anchor{"vendetta-local-phase1-anchor-1", shape.Domain, pin, g1hex(c.G1.Tau[1]), g1hex(c.G1.AlphaTau[0]), g1hex(c.G1.BetaTau[0]), g2hex(c.G2.Beta)}
	return *c, anchor, nil
}

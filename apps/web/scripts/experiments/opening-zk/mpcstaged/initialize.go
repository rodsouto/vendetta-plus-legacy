// Copyright 2026 Vendetta contributors.
// Accumulation equations adapted from Consensys gnark v0.16.4 phase2.go
// (Copyright 2020-2026 Consensys Software Inc., Apache-2.0).
package mpcstaged

import (
	"errors"
	"io"
	"math/big"
	"runtime"
	"runtime/debug"
	"slices"

	curve "github.com/consensys/gnark-crypto/ecc/bn254"
	crypto "github.com/consensys/gnark-crypto/ecc/bn254/mpcsetup"
	native "github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	"github.com/consensys/gnark/constraint"
	cs "github.com/consensys/gnark/constraint/bn254"
)

type OpenCommons func() (io.ReadCloser, error)
type Layout struct {
	Wires, Public int
	Commitments   constraint.Groth16Commitments
}

func release() { runtime.GC(); debug.FreeOSMemory() }

func (s *Store) lagrange(kind string, open OpenCommons) ([]curve.G1Affine, []curve.G2Affine, error) {
	name := "lagrange-" + kind
	n := int(s.index.Domain)
	if s.Has(name) {
		if kind == "tau2" {
			p, err := s.LoadG2(name, n)
			return nil, p, err
		}
		p, err := s.LoadG1(name, n)
		return p, nil, err
	}
	if err := s.emitStage("read-powers-" + kind); err != nil {
		return nil, nil, err
	}
	r, err := open()
	if err != nil {
		return nil, nil, err
	}
	first, second, err := readPowers(r, s.index.Domain, s.index.CommonsHash, kind)
	closeErr := r.Close()
	if err != nil {
		return nil, nil, err
	}
	if closeErr != nil {
		return nil, nil, closeErr
	}
	if kind == "tau1" {
		if !s.Has("z") {
			z := make([]curve.G1Affine, n)
			for i := 0; i < n-1; i++ {
				z[i].Sub(&first[i+n], &first[i])
			}
			bitReverse(z)
			if err = s.SaveG1("z", z[:n-1]); err != nil {
				return nil, nil, err
			}
			z = nil
			release()
		}
		// Drop the unused second half of tau powers before allocating FFT twiddles.
		first = slices.Clone(first[:n])
		release()
	}
	if err = s.emitStage("fft-start-" + kind); err != nil {
		return nil, nil, err
	}
	if kind == "tau2" {
		second = lagrangeCoeffsG2(second)
		release()
		if err = s.SaveG2(name, second); err != nil {
			return nil, nil, err
		}
	} else {
		first = lagrangeCoeffsG1(first)
		release()
		if err = s.SaveG1(name, first); err != nil {
			return nil, nil, err
		}
	}
	return first, second, nil
}

func accumulateG1(c *cs.R1CS, res *curve.G1Affine, t constraint.Term, value *curve.G1Affine) {
	switch id := t.CoeffID(); id {
	case constraint.CoeffIdZero:
		return
	case constraint.CoeffIdOne:
		res.Add(res, value)
	case constraint.CoeffIdMinusOne:
		res.Sub(res, value)
	case constraint.CoeffIdTwo:
		res.Add(res, value).Add(res, value)
	default:
		var tmp curve.G1Affine
		var scalar big.Int
		c.Coefficients[id].BigInt(&scalar)
		tmp.ScalarMultiplication(value, &scalar)
		res.Add(res, &tmp)
	}
}
func accumulateG2(c *cs.R1CS, res *curve.G2Affine, t constraint.Term, value *curve.G2Affine) {
	switch id := t.CoeffID(); id {
	case constraint.CoeffIdZero:
		return
	case constraint.CoeffIdOne:
		res.Add(res, value)
	case constraint.CoeffIdMinusOne:
		res.Sub(res, value)
	case constraint.CoeffIdTwo:
		res.Add(res, value).Add(res, value)
	default:
		var tmp curve.G2Affine
		var scalar big.Int
		c.Coefficients[id].BigInt(&scalar)
		tmp.ScalarMultiplication(value, &scalar)
		res.Add(res, &tmp)
	}
}

// Prepare keeps one transformed powers vector at a time, with durable caches.
// The caller can discard the compiled CS after Prepare and before Assemble.
func Prepare(c *cs.R1CS, s *Store, open OpenCommons) (Layout, error) {
	var empty Layout
	if c == nil || c.GetNbConstraints() > int(s.index.Domain) {
		return empty, errors.New("staged CS domain differs")
	}
	commitments, ok := c.CommitmentInfo.(constraint.Groth16Commitments)
	if !ok {
		return empty, errors.New("Groth16 commitments required")
	}
	if len(commitments) > 255 {
		return empty, errors.New("too many commitments")
	}
	layout := Layout{Wires: c.GetNbInternalVariables() + c.GetNbSecretVariables() + c.GetNbPublicVariables(), Public: c.GetNbPublicVariables(), Commitments: commitments}
	if !(s.Has("a") && s.Has("b") && s.Has("c") && s.Has("z")) {
		if err := prepareTau1(c, s, open, layout.Wires); err != nil {
			return empty, err
		}
		release()
	}
	if !s.Has("k-alpha") && !s.Has("k") {
		if err := prepareK(c, s, open, layout.Wires, "alpha", "c", "k-alpha"); err != nil {
			return empty, err
		}
		release()
	}
	if !s.Has("k") {
		if err := prepareK(c, s, open, layout.Wires, "beta", "k-alpha", "k"); err != nil {
			return empty, err
		}
		release()
	}
	if !s.Has("g2-b") {
		if err := prepareTau2(c, s, open, layout.Wires); err != nil {
			return empty, err
		}
		release()
	}
	return layout, nil
}
func prepareTau1(c *cs.R1CS, s *Store, open OpenCommons, wires int) error {
	coeff, _, err := s.lagrange("tau1", open)
	if err != nil {
		return err
	}
	a, b, k := make([]curve.G1Affine, wires), make([]curve.G1Affine, wires), make([]curve.G1Affine, wires)
	if err = s.emitStage("accumulate-start-tau1"); err != nil {
		return err
	}
	it := c.GetR1CIterator()
	i := 0
	for row := it.Next(); row != nil; row = it.Next() {
		for _, t := range row.L {
			accumulateG1(c, &a[t.WireID()], t, &coeff[i])
		}
		for _, t := range row.R {
			accumulateG1(c, &b[t.WireID()], t, &coeff[i])
		}
		for _, t := range row.O {
			accumulateG1(c, &k[t.WireID()], t, &coeff[i])
		}
		i++
	}
	coeff = nil
	release()
	for _, v := range []struct {
		name   string
		points []curve.G1Affine
	}{{"a", a}, {"b", b}, {"c", k}} {
		if !s.Has(v.name) {
			if err = s.SaveG1(v.name, v.points); err != nil {
				return err
			}
		}
	}
	return nil
}
func prepareK(c *cs.R1CS, s *Store, open OpenCommons, wires int, kind, parent, name string) error {
	coeff, _, err := s.lagrange(kind, open)
	if err != nil {
		return err
	}
	k, err := s.LoadG1(parent, wires)
	if err != nil {
		return err
	}
	if err = s.emitStage("accumulate-start-" + kind); err != nil {
		return err
	}
	it := c.GetR1CIterator()
	i := 0
	for row := it.Next(); row != nil; row = it.Next() {
		terms := row.R
		if kind == "beta" {
			terms = row.L
		}
		for _, t := range terms {
			accumulateG1(c, &k[t.WireID()], t, &coeff[i])
		}
		i++
	}
	coeff = nil
	release()
	return s.SaveG1(name, k)
}
func prepareTau2(c *cs.R1CS, s *Store, open OpenCommons, wires int) error {
	_, coeff, err := s.lagrange("tau2", open)
	if err != nil {
		return err
	}
	b := make([]curve.G2Affine, wires)
	if err = s.emitStage("accumulate-start-tau2"); err != nil {
		return err
	}
	it := c.GetR1CIterator()
	i := 0
	for row := it.Next(); row != nil; row = it.Next() {
		for _, t := range row.R {
			accumulateG2(c, &b[t.WireID()], t, &coeff[i])
		}
		i++
	}
	coeff = nil
	release()
	return s.SaveG2("g2-b", b)
}

func Assemble(s *Store, l Layout) (*native.Phase2, native.Phase2Evaluations, error) {
	p := new(native.Phase2)
	var e native.Phase2Evaluations
	var err error
	_, _, g1, g2 := curve.Generators()
	p.Parameters.G1.Delta = g1
	p.Parameters.G2.Delta = g2
	e.PublicAndCommitmentCommitted = l.Commitments.GetPublicAndCommitmentCommitted(l.Commitments.CommitmentIndexes(), l.Public)
	e.G1.CKK = make([][]curve.G1Affine, len(l.Commitments))
	p.Parameters.G1.SigmaCKK = make([][]curve.G1Affine, len(l.Commitments))
	p.Parameters.G2.Sigma = make([]curve.G2Affine, len(l.Commitments))
	p.Sigmas = make([]crypto.UpdateProof, len(l.Commitments))
	k, err := s.LoadG1("k", l.Wires)
	if err != nil {
		return nil, e, err
	}
	// Merge sorted private-commitment lists without a map proportional to all wires.
	positions := make([]int, len(l.Commitments))
	seen := 0
	committed := 0
	for _, commitment := range l.Commitments {
		committed += len(commitment.PrivateCommitted)
	}
	p.Parameters.G1.PKK = make([]curve.G1Affine, 0, l.Wires-l.Public-committed-len(l.Commitments))
	e.G1.VKK = make([]curve.G1Affine, 0, l.Public+len(l.Commitments))
	for i, c := range l.Commitments {
		e.G1.CKK[i] = make([]curve.G1Affine, 0, len(c.PrivateCommitted))
		p.Parameters.G2.Sigma[i] = g2
	}
	for wire, point := range k {
		owner := -1
		for i, c := range l.Commitments {
			if positions[i] < len(c.PrivateCommitted) && c.PrivateCommitted[positions[i]] == wire {
				if owner != -1 {
					return nil, e, errors.New("duplicate private committed wire")
				}
				owner = i
				positions[i]++
			}
		}
		isCommitment := seen < len(l.Commitments) && l.Commitments[seen].CommitmentIndex == wire
		if owner >= 0 {
			e.G1.CKK[owner] = append(e.G1.CKK[owner], point)
		} else if wire < l.Public || isCommitment {
			e.G1.VKK = append(e.G1.VKK, point)
		} else {
			p.Parameters.G1.PKK = append(p.Parameters.G1.PKK, point)
		}
		if isCommitment {
			seen++
		}
	}
	for i, c := range l.Commitments {
		if positions[i] != len(c.PrivateCommitted) {
			return nil, e, errors.New("private commitment out of bounds")
		}
		p.Parameters.G1.SigmaCKK[i] = slices.Clone(e.G1.CKK[i])
	}
	k = nil
	release()
	if p.Parameters.G1.Z, err = s.LoadG1("z", int(s.index.Domain)-1); err != nil {
		return nil, e, err
	}
	release()
	if e.G1.A, err = s.LoadG1("a", l.Wires); err != nil {
		return nil, e, err
	}
	release()
	if e.G1.B, err = s.LoadG1("b", l.Wires); err != nil {
		return nil, e, err
	}
	release()
	if e.G2.B, err = s.LoadG2("g2-b", l.Wires); err != nil {
		return nil, e, err
	}
	release()
	return p, e, nil
}

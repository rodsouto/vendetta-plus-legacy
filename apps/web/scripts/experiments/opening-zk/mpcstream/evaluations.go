package mpcstream

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"io"

	curve "github.com/consensys/gnark-crypto/ecc/bn254"
	native "github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	"github.com/consensys/gnark/constraint"
	cs "github.com/consensys/gnark/constraint/bn254"
	"vendetta-opening-pairing-experiment/mpcinspect"
)

type EvaluationShape struct {
	Wires                        uint64   `json:"wires"`
	Public                       uint64   `json:"public"`
	Committed                    []uint64 `json:"committed"`
	PublicAndCommitmentCommitted [][]int  `json:"publicAndCommitmentCommitted"`
}

func EvaluationShapeFromCS(c *cs.R1CS) (EvaluationShape, error) {
	if c == nil {
		return EvaluationShape{}, errors.New("compiled CS required")
	}
	commitments, ok := c.GetCommitments().(constraint.Groth16Commitments)
	if !ok {
		return EvaluationShape{}, errors.New("Groth16 commitments required")
	}
	s := EvaluationShape{Wires: uint64(c.GetNbInternalVariables() + c.GetNbSecretVariables() + c.GetNbPublicVariables()), Public: uint64(c.GetNbPublicVariables()), Committed: make([]uint64, len(commitments)), PublicAndCommitmentCommitted: commitments.GetPublicAndCommitmentCommitted(commitments.CommitmentIndexes(), c.GetNbPublicVariables())}
	for i, c := range commitments {
		s.Committed[i] = uint64(len(c.PrivateCommitted))
	}
	_, err := s.Vectors()
	return s, err
}
func (s EvaluationShape) Vectors() ([]mpcinspect.Vector, error) {
	if s.Wires == 0 || s.Wires > 1<<25 || s.Public == 0 || s.Public > s.Wires || s.Committed == nil || s.PublicAndCommitmentCommitted == nil || len(s.Committed) > 255 || len(s.PublicAndCommitmentCommitted) != len(s.Committed) {
		return nil, errors.New("invalid evaluation policy")
	}
	k := uint64(len(s.Committed))
	if s.Public+k > s.Wires {
		return nil, errors.New("public dimensions exceed wires")
	}
	v := []mpcinspect.Vector{{Count: s.Wires}, {Count: s.Wires}, {Count: s.Public + k}}
	for i, n := range s.Committed {
		if uint64(len(s.PublicAndCommitmentCommitted[i])) > s.Public+k {
			return nil, errors.New("public commitment indices exceed bound")
		}
		for j, index := range s.PublicAndCommitmentCommitted[i] {
			if index < 0 || uint64(index) >= s.Public+k || (j > 0 && index <= s.PublicAndCommitmentCommitted[i][j-1]) {
				return nil, errors.New("invalid public commitment translation")
			}
		}
		v = append(v, mpcinspect.Vector{Count: n})
	}
	v = append(v, mpcinspect.Vector{Count: s.Wires, G2: true})
	_, err := mpcinspect.EvaluationWireSize(v)
	return v, err
}
func WriteEvaluations(w io.Writer, e *native.Phase2Evaluations) (int64, error) {
	if e == nil || len(e.G1.CKK) > 255 {
		return 0, errors.New("invalid evaluations")
	}
	if err := binary.Write(w, binary.BigEndian, mpcinspect.EvaluationMagic); err != nil {
		return 0, err
	}
	if err := binary.Write(w, binary.BigEndian, uint16(len(e.G1.CKK))); err != nil {
		return 8, err
	}
	enc := curve.NewEncoder(w)
	values := []any{&e.G1.A, &e.G1.B, &e.G1.VKK}
	for i := range e.G1.CKK {
		values = append(values, &e.G1.CKK[i])
	}
	values = append(values, &e.G2.B)
	for _, value := range values {
		if err := enc.Encode(value); err != nil {
			return 10 + enc.BytesWritten(), err
		}
	}
	return 10 + enc.BytesWritten(), nil
}
func ReadEvaluations(r io.Reader, s EvaluationShape, pin string, maxWire, maxPoints uint64) (native.Phase2Evaluations, error) {
	var empty native.Phase2Evaluations
	vectors, err := s.Vectors()
	if err != nil {
		return empty, err
	}
	var payload uint64
	for _, v := range vectors {
		point := uint64(64)
		if v.G2 {
			point = 128
		}
		payload += point * v.Count
	}
	if maxPoints == 0 || payload > maxPoints {
		return empty, errors.New("evaluation payload exceeds budget")
	}
	g, err := mpcinspect.NewEvaluationGuard(r, vectors, uint64(len(s.Committed)), pin, maxWire)
	if err != nil {
		return empty, err
	}
	var marker uint64
	var count uint16
	if err := binary.Read(g, binary.BigEndian, &marker); err != nil {
		return empty, err
	}
	if err := binary.Read(g, binary.BigEndian, &count); err != nil {
		return empty, err
	}
	e := new(native.Phase2Evaluations)
	e.G1.CKK = make([][]curve.G1Affine, len(s.Committed))
	e.PublicAndCommitmentCommitted = s.PublicAndCommitmentCommitted
	dec := curve.NewDecoder(g)
	values := []any{&e.G1.A, &e.G1.B, &e.G1.VKK}
	for i := range e.G1.CKK {
		values = append(values, &e.G1.CKK[i])
	}
	values = append(values, &e.G2.B)
	for _, value := range values {
		if err := dec.Decode(value); err != nil {
			return empty, err
		}
	}
	if err := g.Finish(); err != nil {
		return empty, err
	}
	h := sha256.New()
	n, err := WriteEvaluations(h, e)
	if err != nil {
		return empty, err
	}
	size, _ := mpcinspect.EvaluationWireSize(vectors)
	if uint64(n) != size || hex.EncodeToString(h.Sum(nil)) != pin {
		return empty, errors.New("noncanonical evaluation cache")
	}
	return *e, nil
}

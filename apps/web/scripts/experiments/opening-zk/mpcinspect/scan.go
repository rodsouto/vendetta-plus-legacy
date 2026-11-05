// Package mpcinspect checks pinned native transcript framing in bounded memory.
// Optional guarded native decoding validates points under explicit budgets;
// neither path approves a setup or verifies an MPC contribution chain.
package mpcinspect

import (
	"bufio"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"vendetta-opening-pairing-experiment/ceremony"
)

const MaxTranscriptBytes uint64 = 2 << 30
const MaxDomain uint64 = 1 << 23
const maxPrivate uint64 = 1 << 25

// Shape is a caller-pinned dimensional policy, not proof of its CS provenance.
// Phase 2 counts must eventually be derived from the authenticated compiled CS.
type Shape struct {
	Schema           string   `json:"schema"`
	CircuitSHA256    string   `json:"circuitSha256"`
	Phase            uint64   `json:"phase"`
	Domain           uint64   `json:"domain"`
	Private          uint64   `json:"private"`
	PrivateCommitted []uint64 `json:"privateCommitted"`
}

func validPin(pin string) bool {
	if len(pin) != 64 {
		return false
	}
	b, err := hex.DecodeString(pin)
	return err == nil && len(b) == 32 && hex.EncodeToString(b) == pin
}

func ParseShape(data []byte, pin string) (Shape, error) {
	var shape Shape
	if !validPin(pin) || ceremony.Digest(data) != pin {
		return shape, errors.New("shape SHA-256 pin differs")
	}
	if err := ceremony.DecodeDocument(data, &shape); err != nil {
		return shape, err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil || len(fields) != 6 {
		return shape, errors.New("native shape requires all six fields")
	}
	_, err := shape.Size()
	return shape, err
}

// Size validates every dimension before computing lengths or reading input.
// All arithmetic is bounded by these caps, including under hostile shape JSON.
func (s Shape) Size() (uint64, error) {
	if s.Schema != "vendetta-hidden-v2-native-shape-1" || !validPin(s.CircuitSHA256) {
		return 0, errors.New("invalid native shape context")
	}
	if s.Domain < 2 || s.Domain > MaxDomain || s.Domain&(s.Domain-1) != 0 {
		return 0, errors.New("native domain outside pinned backend bounds")
	}
	if s.PrivateCommitted == nil || len(s.PrivateCommitted) > 255 || s.Private > maxPrivate {
		return 0, errors.New("invalid native private or commitment dimensions")
	}
	var committed uint64
	for _, n := range s.PrivateCommitted {
		if n > maxPrivate || committed > maxPrivate-n {
			return 0, errors.New("committed vector dimensions exceed bound")
		}
		committed += n
	}
	var size uint64
	switch s.Phase {
	case 1:
		if s.Private != 0 || len(s.PrivateCommitted) != 0 {
			return 0, errors.New("phase one cannot specify phase two dimensions")
		}
		size = 192*s.Domain + 265
	case 2:
		// uint16 count, delta G1/G2, length-prefixed PKK/Z/SigmaCKK,
		// Sigma G2, one update proof per delta/sigma, short challenge.
		size = 203 + 32*(s.Private+s.Domain+committed) + 164*uint64(len(s.PrivateCommitted))
	default:
		return 0, errors.New("native phase must be 1 or 2")
	}
	if size > MaxTranscriptBytes {
		return 0, errors.New("native transcript exceeds absolute byte ceiling")
	}
	return size, nil
}

type Result struct {
	Status                        string `json:"status"`
	TranscriptSHA256              string `json:"transcriptSha256"`
	Bytes                         uint64 `json:"bytes"`
	Phase                         uint64 `json:"phase"`
	Domain                        uint64 `json:"domain"`
	FramingChecked                bool   `json:"framingChecked"`
	PointsValidated               bool   `json:"pointsValidated"`
	CanonicalSerializationChecked bool   `json:"canonicalSerializationChecked"`
	CircuitBytesVerified          bool   `json:"circuitBytesVerified"`
	MPCTranscriptVerified         bool   `json:"mpcTranscriptVerified"`
	ArtifactBytesVerified         bool   `json:"artifactBytesVerified"`
	ProductionApproved            bool   `json:"productionApproved"`
}

type scanner struct {
	r   *bufio.Reader
	err error
	buf [64]byte
}

func (s *scanner) take(n int) []byte {
	if s.err != nil {
		return nil
	}
	_, s.err = io.ReadFull(s.r, s.buf[:n])
	return s.buf[:n]
}
func (s *scanner) point(size int) {
	b := s.take(size)
	if s.err == nil && b[0]&0xc0 == 0 {
		s.err = errors.New("uncompressed native point rejected")
	}
}
func (s *scanner) points(n uint64, size int) {
	for i := uint64(0); i < n && s.err == nil; i++ {
		s.point(size)
	}
}
func (s *scanner) vector(n uint64) {
	b := s.take(4)
	if s.err == nil && uint64(binary.BigEndian.Uint32(b)) != n {
		s.err = errors.New("native vector length differs from pinned shape")
	}
	s.points(n, 32)
}
func (s *scanner) proof() { s.point(32); s.point(64) }

// Scan performs format/length/hash checks only. A successful result must never
// substitute for subgroup checks, canonical native decoding or MPC verification.
// The input is read once, at most expectedSize+1 bytes, with a fixed 64 KiB buffer.
func Scan(r io.Reader, shape Shape, transcriptPin string, maxBytes uint64) (Result, error) {
	var result Result
	size, err := shape.Size()
	if err != nil {
		return result, err
	}
	if !validPin(transcriptPin) || maxBytes == 0 || maxBytes > MaxTranscriptBytes || size > maxBytes {
		return result, errors.New("invalid transcript pin or byte budget")
	}
	h := sha256.New()
	s := scanner{r: bufio.NewReaderSize(io.TeeReader(io.LimitReader(r, int64(size)+1), h), 64*1024)}
	if shape.Phase == 1 {
		for range 3 {
			s.proof()
		}
		b := s.take(8)
		if s.err == nil && binary.BigEndian.Uint64(b) != shape.Domain {
			s.err = errors.New("native domain differs from pinned shape")
		}
		s.point(64)
		s.points(2*shape.Domain-2, 32)
		s.points(shape.Domain-1, 64)
		s.points(2*shape.Domain, 32)
	} else {
		b := s.take(2)
		if s.err == nil && int(binary.BigEndian.Uint16(b)) != len(shape.PrivateCommitted) {
			s.err = errors.New("native commitment count differs from pinned shape")
		}
		s.point(32)
		s.vector(shape.Private)
		s.vector(shape.Domain - 1)
		s.point(64)
		for _, n := range shape.PrivateCommitted {
			s.vector(n)
		}
		s.points(uint64(len(shape.PrivateCommitted)), 64)
		for i := 0; i <= len(shape.PrivateCommitted); i++ {
			s.proof()
		}
	}
	b := s.take(1)
	if s.err == nil && b[0] != 32 {
		s.err = errors.New("native contribution challenge must have 32 bytes")
	}
	s.take(32)
	if s.err != nil {
		return result, s.err
	}
	if _, err := s.r.ReadByte(); err != io.EOF {
		if err == nil {
			return result, errors.New("trailing native transcript bytes")
		}
		return result, err
	}
	digest := hex.EncodeToString(h.Sum(nil))
	if digest != transcriptPin {
		return result, fmt.Errorf("transcript SHA-256 pin differs")
	}
	return Result{Status: "framing-only", TranscriptSHA256: digest, Bytes: size,
		Phase: shape.Phase, Domain: shape.Domain, FramingChecked: true}, nil
}

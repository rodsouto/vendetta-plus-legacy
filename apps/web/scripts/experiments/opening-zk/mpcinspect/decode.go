package mpcinspect

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"unsafe"

	curve "github.com/consensys/gnark-crypto/ecc/bn254"
	"github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
)

// PointPayloadBytes is a structural subtotal, not a bound on decoded heap/RSS.
// Native deserializers also allocate refs, proof objects and runtime temporaries.
func (s Shape) PointPayloadBytes() (uint64, error) {
	if _, err := s.Size(); err != nil {
		return 0, err
	}
	var g1, g2 uint64
	if s.Phase == 1 {
		g1 = 4*s.Domain - 1
		g2 = s.Domain + 1
	} else {
		g1 = s.Domain - 1 + s.Private + 1
		for _, n := range s.PrivateCommitted {
			g1 += n
		}
		g2 = uint64(len(s.PrivateCommitted)) + 1
	}
	return g1*uint64(unsafe.Sizeof(curve.G1Affine{})) + g2*uint64(unsafe.Sizeof(curve.G2Affine{})), nil
}

type Native struct {
	Phase1 *mpcsetup.Phase1
	Phase2 *mpcsetup.Phase2
	Result Result
}

// Decode checks point/subgroup validity using the pinned native decoder, then
// compares a streaming canonical reserialization with the exact input digest.
// Allocation prefixes are guarded BEFORE forwarding to ReadFrom. It returns no
// native object on any failure. It does not verify an MPC contribution chain.
// Both budgets are mandatory; callers must additionally enforce kernel memory,
// CPU and wall limits. PointPayloadBytes alone is not a heap/RSS limit.
func Decode(r io.Reader, shape Shape, pin string, maxWire, maxPointPayload uint64) (*Native, error) {
	return decodeState(r, shape, pin, maxWire, maxPointPayload, false)
}
func DecodeInitialPhase2(r io.Reader, shape Shape, pin string, maxWire, maxPointPayload uint64) (*Native, error) {
	if shape.Phase != 2 {
		return nil, errors.New("initial cache must be phase two")
	}
	return decodeState(r, shape, pin, maxWire, maxPointPayload, true)
}
func decodeState(r io.Reader, shape Shape, pin string, maxWire, maxPointPayload uint64, initial bool) (*Native, error) {
	points, err := shape.PointPayloadBytes()
	if err != nil {
		return nil, err
	}
	if maxPointPayload == 0 || points > maxPointPayload {
		return nil, errors.New("native point payload exceeds decode budget")
	}
	var guard *Guard
	if initial {
		guard, err = NewInitialPhase2Guard(r, shape, pin, maxWire)
	} else {
		guard, err = NewGuard(r, shape, pin, maxWire)
	}
	if err != nil {
		return nil, err
	}
	var value interface {
		io.ReaderFrom
		io.WriterTo
	}
	native := new(Native)
	if shape.Phase == 1 {
		native.Phase1 = new(mpcsetup.Phase1)
		value = native.Phase1
	} else {
		native.Phase2 = new(mpcsetup.Phase2)
		value = native.Phase2
	}
	n, err := value.ReadFrom(guard)
	if err != nil {
		return nil, err
	}
	if uint64(n) != guard.expected {
		return nil, errors.New("native decoder consumed incorrect byte count")
	}
	if err := guard.Finish(); err != nil {
		return nil, err
	}
	h := sha256.New()
	n, err = value.WriteTo(h)
	if err != nil {
		return nil, err
	}
	if uint64(n) != guard.expected || hex.EncodeToString(h.Sum(nil)) != pin {
		return nil, errors.New("native transcript is not canonically serialized")
	}
	native.Result = Result{Status: "native-points-validated", TranscriptSHA256: pin, Bytes: guard.expected,
		Phase: shape.Phase, Domain: shape.Domain, FramingChecked: true, PointsValidated: true, CanonicalSerializationChecked: true}
	if initial {
		native.Result.Status = "native-initial-state-validated"
	}
	return native, nil
}

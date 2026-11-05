package mpcinspect

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/constraint"
	cs "github.com/consensys/gnark/constraint/bn254"
)

// ShapeFromCS binds dimensions to actual compiled BN254 R1CS bytes by hashing
// WriteTo, without deserializing an untrusted CS or buffering its encoding.
// The expected digest must come from an independently authenticated policy.
// Matching it does not by itself authenticate the policy's author or source bundle.
func ShapeFromCS(compiled *cs.R1CS, expected string, phase uint64) (Shape, error) {
	var shape Shape
	if compiled == nil || !validPin(expected) || (phase != 1 && phase != 2) {
		return shape, errors.New("missing compiled CS, digest or phase")
	}
	count := compiled.GetNbConstraints()
	if count < 1 || count > int(MaxDomain) {
		return shape, errors.New("compiled constraints exceed supported domain")
	}
	domain := ecc.NextPowerOfTwo(uint64(count))
	if domain < 2 {
		domain = 2
	}
	shape = Shape{Schema: "vendetta-hidden-v2-native-shape-1", CircuitSHA256: expected, Phase: phase, Domain: domain, PrivateCommitted: []uint64{}}
	if phase == 2 {
		commitments, ok := compiled.GetCommitments().(constraint.Groth16Commitments)
		if !ok || len(commitments) > 255 {
			return Shape{}, errors.New("unsupported compiled commitments")
		}
		internal, secret := compiled.GetNbInternalVariables(), compiled.GetNbSecretVariables()
		if internal < 0 || secret < 0 {
			return Shape{}, errors.New("invalid compiled variable counts")
		}
		private := uint64(internal) + uint64(secret)
		committed := uint64(len(commitments))
		for _, c := range commitments {
			n := uint64(len(c.PrivateCommitted))
			if n > maxPrivate || committed > maxPrivate-n {
				return Shape{}, errors.New("compiled commitment total exceeds bound")
			}
			committed += n
			shape.PrivateCommitted = append(shape.PrivateCommitted, n)
		}
		if committed > private {
			return Shape{}, errors.New("compiled commitments exceed private variables")
		}
		shape.Private = private - committed
	}
	if _, err := shape.Size(); err != nil {
		return Shape{}, err
	}
	h := sha256.New()
	if _, err := compiled.WriteTo(h); err != nil {
		return Shape{}, err
	}
	if hex.EncodeToString(h.Sum(nil)) != expected {
		return Shape{}, errors.New("compiled CS bytes differ from expected digest")
	}
	return shape, nil
}

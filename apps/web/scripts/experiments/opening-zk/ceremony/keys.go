package ceremony

import (
	"bytes"
	"crypto/ed25519"
	"encoding/hex"
	"errors"

	"filippo.io/edwards25519"
)

// ParsePublicKey rejects invalid, noncanonical and small-order encodings before
// keys can enter a trust roster. This validates a key, not its owner's identity.
func ParsePublicKey(encoded string) (ed25519.PublicKey, error) {
	raw, err := hex.DecodeString(encoded)
	if err != nil || !hashPattern.MatchString(encoded) {
		return nil, errors.New("invalid Ed25519 key encoding")
	}
	point, err := new(edwards25519.Point).SetBytes(raw)
	if err != nil || !bytes.Equal(point.Bytes(), raw) {
		return nil, errors.New("invalid or noncanonical Ed25519 point")
	}
	if new(edwards25519.Point).MultByCofactor(point).Equal(edwards25519.NewIdentityPoint()) == 1 {
		return nil, errors.New("small-order Ed25519 public key")
	}
	return ed25519.PublicKey(raw), nil
}

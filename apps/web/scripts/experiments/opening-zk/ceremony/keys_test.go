package ceremony

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/hex"
	"strings"
	"testing"

	"filippo.io/edwards25519"
)

func TestPublicKeyPolicy(t *testing.T) {
	pub, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ParsePublicKey(hex.EncodeToString(pub)); err != nil {
		t.Fatal(err)
	}
	// Identity A and R=B,S=1 satisfy S*B = R + H(R,A,M)*A for any M.
	identity := "01" + strings.Repeat("00", 31)
	signature := append(edwards25519.NewGeneratorPoint().Bytes(), append([]byte{1}, make([]byte, 31)...)...)
	raw, _ := hex.DecodeString(identity)
	if !ed25519.Verify(raw, []byte("arbitrary forged review"), signature) {
		t.Fatal("forgery fixture no longer exercises verifier behavior")
	}
	for name, key := range map[string]string{
		"identity": identity, "identity-sign-alias": "01" + strings.Repeat("00", 30) + "80",
		"order-four": strings.Repeat("00", 32), "order-two": "ec" + strings.Repeat("ff", 30) + "7f",
		"noncanonical-identity": "ee" + strings.Repeat("ff", 30) + "7f",
		"noncanonical-field":    strings.Repeat("ff", 32), "short": "01",
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := ParsePublicKey(key); err == nil {
				t.Fatal("invalid key accepted")
			}
			f := fresh(t)
			f.trust.Reviewers[0].PublicKey = key
			f.review.TrustSHA256 = Digest(encode(t, f.trust))
			if err := f.verify(t, f.envelope(t)); err == nil {
				t.Fatal("invalid trust key accepted")
			}
			plan, e := executionFixture(t)
			e.Participants[0].PublicKey = key
			data := encode(t, e)
			if _, err := ValidateExecution(plan, Digest(plan), data, Digest(data)); err == nil {
				t.Fatal("invalid participant key accepted")
			}
		})
	}
}

func TestIdentityKeyReviewForgeryRejected(t *testing.T) {
	f := fresh(t)
	f.trust.Reviewers[0].PublicKey = "01" + strings.Repeat("00", 31)
	f.review.TrustSHA256 = Digest(encode(t, f.trust))
	envelope := f.envelope(t)
	forged := append(edwards25519.NewGeneratorPoint().Bytes(), append([]byte{1}, make([]byte, 31)...)...)
	envelope.Signatures[0].Signature = hex.EncodeToString(forged)
	// The other signature is valid under the unchanged second reviewer's key.
	// Without key admission checks this entire two-signature envelope verifies.
	if err := f.verify(t, envelope); err == nil {
		t.Fatal("forged quorum member accepted")
	}
}

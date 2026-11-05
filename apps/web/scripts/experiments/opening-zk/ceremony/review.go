// Package ceremony validates design plans and externally signed design reviews.
// It does not execute a ceremony, verify MPC transcripts or approve production.
package ceremony

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"reflect"
	"regexp"
	"time"
)

const (
	MaxDocumentBytes = 64 * 1024
	MaxReviewers     = 32
	ReviewDomain     = "VENDETTA_HIDDEN_V2_DESIGN_REVIEW_V1\n"
	planSchema       = "vendetta-hidden-v2-ceremony-plan-1"
	trustSchema      = "vendetta-hidden-v2-review-trust-1"
	reviewSchema     = "vendetta-hidden-v2-design-review-1"
)

var (
	idPattern   = regexp.MustCompile(`^[a-z][a-z0-9_-]{0,63}$`)
	hashPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)
)

type Backend struct {
	Curve        string `json:"curve"`
	GnarkVersion string `json:"gnarkVersion"`
	GnarkCommit  string `json:"gnarkCommit"`
}

type Circuit struct {
	Kind         string `json:"kind"`
	SHA256       string `json:"circuitSha256"`
	Constraints  uint64 `json:"constraints"`
	PublicInputs uint64 `json:"publicInputs"`
	DomainSize   uint64 `json:"domainSize"`
}

type Plan struct {
	Schema             string    `json:"schema"`
	CeremonyID         string    `json:"ceremonyId"`
	SourceBundleSHA256 string    `json:"sourceBundleSha256"`
	Backend            Backend   `json:"backend"`
	Phase1Policy       string    `json:"phase1Policy"`
	BeaconPolicy       string    `json:"beaconPolicy"`
	Participants       []string  `json:"participants"`
	Circuits           []Circuit `json:"circuits"`
}

type Reviewer struct {
	ID        string `json:"id"`
	PublicKey string `json:"publicKey"`
}

type Trust struct {
	Schema    string     `json:"schema"`
	ExpiresAt string     `json:"expiresAt"`
	Threshold int        `json:"threshold"`
	Reviewers []Reviewer `json:"reviewers"`
}

type Review struct {
	Schema      string `json:"schema"`
	CeremonyID  string `json:"ceremonyId"`
	PlanSHA256  string `json:"planSha256"`
	TrustSHA256 string `json:"trustSha256"`
	Purpose     string `json:"purpose"`
	ReviewedAt  string `json:"reviewedAt"`
	ExpiresAt   string `json:"expiresAt"`
}

type Signature struct {
	ReviewerID string `json:"reviewerId"`
	Signature  string `json:"signature"`
}

type Envelope struct {
	Payload    string      `json:"payload"`
	Signatures []Signature `json:"signatures"`
}

func Digest(data []byte) string {
	return fmt.Sprintf("%x", sha256.Sum256(data))
}

// BoundRead never trusts a declared length and never reads more than limit+1.
func BoundRead(r io.Reader) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(r, MaxDocumentBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > MaxDocumentBytes {
		return nil, errors.New("document exceeds 64 KiB")
	}
	return data, nil
}

func pin(data []byte, expected string) error {
	if !hashPattern.MatchString(expected) || Digest(data) != expected {
		return errors.New("document SHA-256 does not match external pin")
	}
	return nil
}

// Reject duplicate fields before typed decoding: encoding/json otherwise accepts
// ambiguous documents using the last duplicate value. Bound nesting as well.
func jsonValue(dec *json.Decoder, depth int) error {
	if depth > 16 {
		return errors.New("JSON nesting exceeds limit")
	}
	token, err := dec.Token()
	if err != nil {
		return err
	}
	delim, ok := token.(json.Delim)
	if !ok {
		return nil
	}
	switch delim {
	case '{':
		seen := map[string]bool{}
		for dec.More() {
			key, err := dec.Token()
			if err != nil {
				return err
			}
			name, ok := key.(string)
			if !ok || seen[name] {
				return errors.New("duplicate or invalid JSON field")
			}
			seen[name] = true
			if err := jsonValue(dec, depth+1); err != nil {
				return err
			}
		}
	case '[':
		for dec.More() {
			if err := jsonValue(dec, depth+1); err != nil {
				return err
			}
		}
	default:
		return errors.New("unexpected JSON delimiter")
	}
	_, err = dec.Token()
	return err
}

func strictJSON(data []byte, target any) error {
	if len(data) > MaxDocumentBytes {
		return errors.New("document exceeds 64 KiB")
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	if err := jsonValue(dec, 0); err != nil {
		return err
	}
	if _, err := dec.Token(); err != io.EOF {
		return errors.New("trailing JSON data")
	}
	if err := exactFields(data, reflect.TypeOf(target).Elem()); err != nil {
		return err
	}
	dec = json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	return dec.Decode(target)
}

// All schema fields are required and case-sensitive. DisallowUnknownFields
// alone still accepts case-insensitive aliases and null for scalar fields.
func exactFields(data []byte, t reflect.Type) error {
	if bytes.Equal(bytes.TrimSpace(data), []byte("null")) {
		return errors.New("null is not a schema value")
	}
	switch t.Kind() {
	case reflect.Struct:
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(data, &fields); err != nil {
			return err
		}
		if len(fields) != t.NumField() {
			return errors.New("unknown or missing schema field")
		}
		for i := 0; i < t.NumField(); i++ {
			f := t.Field(i)
			value, ok := fields[f.Tag.Get("json")]
			if !ok {
				return errors.New("missing or incorrectly cased schema field")
			}
			if err := exactFields(value, f.Type); err != nil {
				return err
			}
		}
	case reflect.Slice:
		var values []json.RawMessage
		if err := json.Unmarshal(data, &values); err != nil {
			return err
		}
		for _, value := range values {
			if err := exactFields(value, t.Elem()); err != nil {
				return err
			}
		}
	}
	return nil
}

// ValidatePlan checks a pinned design inventory, not circuit bytes or identities.
func ValidatePlan(data []byte, expected string) (Plan, error) {
	var p Plan
	if err := pin(data, expected); err != nil {
		return p, err
	}
	if err := strictJSON(data, &p); err != nil {
		return p, err
	}
	if p.Schema != planSchema || !idPattern.MatchString(p.CeremonyID) ||
		!hashPattern.MatchString(p.SourceBundleSHA256) ||
		p.Backend != (Backend{"BN254", "v0.16.4", "e974abb44722dd201a7f1949baeabca0fef5866e"}) ||
		p.Phase1Policy != "separate-per-circuit" || p.BeaconPolicy != "authenticate-after-phase-close" {
		return p, errors.New("unsupported or incomplete ceremony plan")
	}
	if len(p.Participants) < 2 || len(p.Participants) > MaxReviewers {
		return p, errors.New("plan requires 2..32 participant identifiers")
	}
	seen := map[string]bool{}
	for _, id := range p.Participants {
		if !idPattern.MatchString(id) || seen[id] {
			return p, errors.New("invalid or duplicate participant identifier")
		}
		seen[id] = true
	}
	if len(p.Circuits) != 2 {
		return p, errors.New("plan must bind both game circuits")
	}
	kinds, hashes := map[string]bool{}, map[string]bool{}
	for _, c := range p.Circuits {
		inputs := uint64(55)
		if c.Kind == "invalid-point" {
			inputs = 2
		} else if c.Kind != "opening" {
			return p, errors.New("unsupported circuit kind")
		}
		if kinds[c.Kind] || !hashPattern.MatchString(c.SHA256) || hashes[c.SHA256] || c.PublicInputs != inputs ||
			c.Constraints < 2 || c.Constraints > 1<<23 || c.DomainSize > 1<<23 ||
			c.DomainSize < c.Constraints || c.DomainSize&(c.DomainSize-1) != 0 || c.DomainSize/2 >= c.Constraints {
			return p, errors.New("invalid circuit digest, inputs or minimal power-of-two domain")
		}
		kinds[c.Kind], hashes[c.SHA256] = true, true
	}
	return p, nil
}

func timestamp(value string) (time.Time, error) {
	t, err := time.Parse("2006-01-02T15:04:05Z", value)
	if err != nil || t.Format("2006-01-02T15:04:05Z") != value {
		return t, errors.New("timestamp must be UTC YYYY-MM-DDTHH:MM:SSZ")
	}
	return t, nil
}

// VerifyReview authenticates a design review against an externally pinned trust
// file. The caller must supply a current trusted clock and current trust pin.
func VerifyReview(planData []byte, planPin string, trustData []byte, trustPin string, envelopeData []byte, now time.Time) (Review, error) {
	var review Review
	plan, err := ValidatePlan(planData, planPin)
	if err != nil {
		return review, err
	}
	if err := pin(trustData, trustPin); err != nil {
		return review, err
	}
	var trust Trust
	if err := strictJSON(trustData, &trust); err != nil {
		return review, err
	}
	expires, err := timestamp(trust.ExpiresAt)
	if err != nil || !now.Before(expires) || trust.Schema != trustSchema ||
		len(trust.Reviewers) < 2 || len(trust.Reviewers) > MaxReviewers || trust.Threshold < 2 || trust.Threshold > len(trust.Reviewers) {
		return review, errors.New("invalid or expired review trust policy")
	}
	keys, keyIDs := map[string]ed25519.PublicKey{}, map[string]bool{}
	for _, r := range trust.Reviewers {
		key, err := ParsePublicKey(r.PublicKey)
		if err != nil || !idPattern.MatchString(r.ID) || keys[r.ID] != nil || keyIDs[r.PublicKey] {
			return review, errors.New("invalid or duplicate reviewer identity/key")
		}
		keys[r.ID], keyIDs[r.PublicKey] = ed25519.PublicKey(key), true
	}
	var envelope Envelope
	if err := strictJSON(envelopeData, &envelope); err != nil {
		return review, err
	}
	payload, err := base64.StdEncoding.Strict().DecodeString(envelope.Payload)
	if err != nil || len(payload) == 0 || base64.StdEncoding.EncodeToString(payload) != envelope.Payload ||
		len(envelope.Signatures) < trust.Threshold || len(envelope.Signatures) > len(keys) {
		return review, errors.New("invalid review envelope or signature count")
	}
	seen := map[string]bool{}
	message := append([]byte(ReviewDomain), payload...)
	for _, signature := range envelope.Signatures {
		key := keys[signature.ReviewerID]
		sig, err := hex.DecodeString(signature.Signature)
		if key == nil || seen[signature.ReviewerID] || err != nil || len(sig) != ed25519.SignatureSize ||
			hex.EncodeToString(sig) != signature.Signature || !ed25519.Verify(key, message, sig) {
			return review, errors.New("unknown, duplicate or invalid review signature")
		}
		seen[signature.ReviewerID] = true
	}
	if err := strictJSON(payload, &review); err != nil {
		return review, err
	}
	reviewed, err := timestamp(review.ReviewedAt)
	if err != nil {
		return review, err
	}
	until, err := timestamp(review.ExpiresAt)
	if err != nil || reviewed.After(now) || !reviewed.Before(until) || !now.Before(until) || until.After(expires) ||
		review.Schema != reviewSchema || review.Purpose != "design-review-only" ||
		review.CeremonyID != plan.CeremonyID || review.PlanSHA256 != planPin || review.TrustSHA256 != trustPin {
		return review, errors.New("review is expired, premature or bound to another plan/trust/purpose")
	}
	return review, nil
}

// DecodeDocument exposes the same bounded, exact schema decoder to the isolated
// rehearsal tooling. Decoding a document never authenticates its contents.
func DecodeDocument(data []byte, target any) error { return strictJSON(data, target) }

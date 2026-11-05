package ceremony

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func encode(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

type fixture struct {
	plan   Plan
	trust  Trust
	review Review
	keys   []ed25519.PrivateKey
	now    time.Time
}

func fresh(t *testing.T) fixture {
	t.Helper()
	f := fixture{
		plan: Plan{
			Schema: planSchema, CeremonyID: "local-design-test", SourceBundleSHA256: strings.Repeat("a", 64),
			Backend:      Backend{"BN254", "v0.16.4", "e974abb44722dd201a7f1949baeabca0fef5866e"},
			Phase1Policy: "separate-per-circuit", BeaconPolicy: "authenticate-after-phase-close",
			Participants: []string{"participant-a", "participant-b"},
			Circuits: []Circuit{{"opening", strings.Repeat("b", 64), 5139537, 55, 1 << 23},
				{"invalid-point", strings.Repeat("c", 64), 3760005, 2, 1 << 22}},
		},
		trust: Trust{Schema: trustSchema, ExpiresAt: "2026-11-03T00:00:00Z", Threshold: 2},
		now:   time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC),
	}
	for _, id := range []string{"reviewer-a", "reviewer-b", "reviewer-c"} {
		pub, key, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			t.Fatal(err)
		}
		f.keys = append(f.keys, key)
		f.trust.Reviewers = append(f.trust.Reviewers, Reviewer{id, hex.EncodeToString(pub)})
	}
	f.review = Review{reviewSchema, f.plan.CeremonyID, Digest(encode(t, f.plan)), Digest(encode(t, f.trust)),
		"design-review-only", "2026-10-31T00:00:00Z", "2026-11-02T00:00:00Z"}
	return f
}

func (f fixture) envelope(t *testing.T) Envelope {
	return f.sign(encode(t, f.review), ReviewDomain)
}

func (f fixture) sign(payload []byte, domain string) Envelope {
	e := Envelope{Payload: base64.StdEncoding.EncodeToString(payload)}
	for i := range 2 {
		e.Signatures = append(e.Signatures, Signature{f.trust.Reviewers[i].ID,
			hex.EncodeToString(ed25519.Sign(f.keys[i], append([]byte(domain), payload...)))})
	}
	return e
}

func (f fixture) verify(t *testing.T, e Envelope) error {
	plan, trust := encode(t, f.plan), encode(t, f.trust)
	_, err := VerifyReview(plan, Digest(plan), trust, Digest(trust), encode(t, e), f.now)
	return err
}

func TestPlanValidation(t *testing.T) {
	f := fresh(t)
	data := encode(t, f.plan)
	if _, err := ValidatePlan(data, Digest(data)); err != nil {
		t.Fatal(err)
	}
	cases := map[string]func(*Plan){
		"backend":               func(p *Plan) { p.Backend.GnarkVersion = "v0.0.0" },
		"phase1-policy":         func(p *Plan) { p.Phase1Policy = "shared-unreviewed" },
		"beacon-policy":         func(p *Plan) { p.BeaconPolicy = "fixed-test-beacon" },
		"source-hash":           func(p *Plan) { p.SourceBundleSHA256 = "" },
		"ceremony-id":           func(p *Plan) { p.CeremonyID = "../escape" },
		"participant-count":     func(p *Plan) { p.Participants = p.Participants[:1] },
		"duplicate-participant": func(p *Plan) { p.Participants[1] = p.Participants[0] },
		"missing-circuit":       func(p *Plan) { p.Circuits = p.Circuits[:1] },
		"circuit-kind":          func(p *Plan) { p.Circuits[1].Kind = "other" },
		"duplicate-circuit":     func(p *Plan) { p.Circuits[1] = p.Circuits[0] },
		"duplicate-cs":          func(p *Plan) { p.Circuits[1].SHA256 = p.Circuits[0].SHA256 },
		"public-inputs":         func(p *Plan) { p.Circuits[0].PublicInputs++ },
		"zero-domain":           func(p *Plan) { p.Circuits[0].DomainSize = 0 },
		"small-domain":          func(p *Plan) { p.Circuits[0].DomainSize = 1 << 22 },
		"not-power-two":         func(p *Plan) { p.Circuits[0].DomainSize-- },
		"large-domain":          func(p *Plan) { p.Circuits[0].DomainSize = 1 << 24 },
		"nonminimal-domain":     func(p *Plan) { p.Circuits[1].DomainSize = 1 << 23 },
		"large-constraints":     func(p *Plan) { p.Circuits[0].Constraints = 1 << 24 },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			f := fresh(t)
			mutate(&f.plan)
			data := encode(t, f.plan)
			if _, err := ValidatePlan(data, Digest(data)); err == nil {
				t.Fatal("invalid plan accepted")
			}
		})
	}
	if _, err := ValidatePlan(data, strings.Repeat("0", 64)); err == nil {
		t.Fatal("wrong external pin accepted")
	}
}

func TestStrictDocuments(t *testing.T) {
	data := string(encode(t, fresh(t).plan))
	cases := map[string]string{
		"duplicate":  strings.Replace(data, `"schema":`, `"schema":"wrong","schema":`, 1),
		"case-alias": strings.Replace(data, `"schema":`, `"Schema":`, 1),
		"unknown":    strings.Replace(data, `"schema":`, `"unknown":0,"schema":`, 1),
		"null":       strings.Replace(data, `"constraints":5139537`, `"constraints":null`, 1),
		"fractional": strings.Replace(data, `"constraints":5139537`, `"constraints":1.5`, 1),
		"trailing":   data + `{}`,
		"deep":       strings.Repeat("[", 18) + "0" + strings.Repeat("]", 18),
		"oversized":  strings.Repeat(" ", MaxDocumentBytes) + data,
		"missing":    strings.Replace(data, `"schema":"`+planSchema+`",`, "", 1),
	}
	for name, text := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := ValidatePlan([]byte(text), Digest([]byte(text))); err == nil {
				t.Fatal("ambiguous document accepted")
			}
		})
	}
	if _, err := BoundRead(bytes.NewReader(make([]byte, MaxDocumentBytes+1))); err == nil {
		t.Fatal("read limit not enforced")
	}
}

func TestReviewVerification(t *testing.T) {
	f := fresh(t)
	if err := f.verify(t, f.envelope(t)); err != nil {
		t.Fatal(err)
	}
	cases := map[string]func(*fixture, *Envelope){
		"noncanonical-base64": func(_ *fixture, e *Envelope) { e.Payload += "\n" },
		"extra-invalid-signature": func(_ *fixture, e *Envelope) {
			e.Signatures = append(e.Signatures, Signature{"reviewer-c", strings.Repeat("0", 128)})
		},
		"oversized-trust-roster": func(f *fixture, _ *Envelope) {
			for len(f.trust.Reviewers) <= MaxReviewers {
				f.trust.Reviewers = append(f.trust.Reviewers, f.trust.Reviewers[0])
			}
		},
		"below-quorum":        func(_ *fixture, e *Envelope) { e.Signatures = e.Signatures[:1] },
		"duplicate-signer":    func(_ *fixture, e *Envelope) { e.Signatures[1] = e.Signatures[0] },
		"unknown-signer":      func(_ *fixture, e *Envelope) { e.Signatures[0].ReviewerID = "outsider" },
		"bad-signature":       func(_ *fixture, e *Envelope) { e.Signatures[0].Signature = strings.Repeat("0", 128) },
		"payload-tamper":      func(_ *fixture, e *Envelope) { e.Payload = base64.StdEncoding.EncodeToString([]byte(`{}`)) },
		"wrong-domain":        func(f *fixture, e *Envelope) { *e = f.sign(encode(t, f.review), "another-domain") },
		"changed-plan":        func(f *fixture, _ *Envelope) { f.plan.CeremonyID = "another-plan" },
		"changed-trust":       func(f *fixture, _ *Envelope) { f.trust.ExpiresAt = "2026-11-04T00:00:00Z" },
		"duplicate-key":       func(f *fixture, _ *Envelope) { f.trust.Reviewers[1].PublicKey = f.trust.Reviewers[0].PublicKey },
		"duplicate-identity":  func(f *fixture, _ *Envelope) { f.trust.Reviewers[1].ID = f.trust.Reviewers[0].ID },
		"threshold-one":       func(f *fixture, _ *Envelope) { f.trust.Threshold = 1 },
		"threshold-too-high":  func(f *fixture, _ *Envelope) { f.trust.Threshold = 4 },
		"expired-trust":       func(f *fixture, _ *Envelope) { f.trust.ExpiresAt = "2026-10-31T12:00:00Z" },
		"revoked-key":         func(f *fixture, _ *Envelope) { f.trust.Reviewers = f.trust.Reviewers[1:] },
		"future-review":       func(f *fixture, e *Envelope) { f.review.ReviewedAt = "2026-11-01T00:00:00Z"; *e = f.envelope(t) },
		"expired-review":      func(f *fixture, e *Envelope) { f.review.ExpiresAt = "2026-10-31T12:00:00Z"; *e = f.envelope(t) },
		"beyond-trust-expiry": func(f *fixture, e *Envelope) { f.review.ExpiresAt = "2026-11-04T00:00:00Z"; *e = f.envelope(t) },
		"wrong-purpose":       func(f *fixture, e *Envelope) { f.review.Purpose = "production-approved"; *e = f.envelope(t) },
		"wrong-plan-binding":  func(f *fixture, e *Envelope) { f.review.PlanSHA256 = strings.Repeat("0", 64); *e = f.envelope(t) },
		"wrong-trust-binding": func(f *fixture, e *Envelope) { f.review.TrustSHA256 = strings.Repeat("0", 64); *e = f.envelope(t) },
		"timestamp-offset":    func(f *fixture, e *Envelope) { f.review.ReviewedAt = "2026-10-31T00:00:00+00:00"; *e = f.envelope(t) },
		"signed-duplicate-field": func(f *fixture, e *Envelope) {
			payload := bytes.Replace(encode(t, f.review), []byte(`"schema":`), []byte(`"schema":"wrong","schema":`), 1)
			*e = f.sign(payload, ReviewDomain)
		},
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			f := fresh(t)
			e := f.envelope(t)
			mutate(&f, &e)
			if err := f.verify(t, e); err == nil {
				t.Fatal("invalid design review accepted")
			}
		})
	}
	plan, trust := encode(t, f.plan), encode(t, f.trust)
	if _, err := VerifyReview(plan, Digest(plan), trust, strings.Repeat("0", 64), encode(t, f.envelope(t)), f.now); err == nil {
		t.Fatal("substituted external trust pin accepted")
	}
}

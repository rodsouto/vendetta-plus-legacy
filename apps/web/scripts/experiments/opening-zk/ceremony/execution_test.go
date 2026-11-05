package ceremony

import (
	"strings"
	"testing"
)

func executionFixture(t *testing.T) ([]byte, Execution) {
	f := fresh(t)
	e := Execution{Schema: "vendetta-hidden-v2-execution-plan-1", PlanSHA256: Digest(encode(t, f.plan)),
		Participants: []Reviewer{{f.plan.Participants[0], f.trust.Reviewers[0].PublicKey}, {f.plan.Participants[1], f.trust.Reviewers[1].PublicKey}},
		Resources:    Resources{1 << 30, 1 << 20, 1 << 24, 3600, 2}}
	for _, kind := range []string{"opening", "invalid-point"} {
		e.Phases = append(e.Phases,
			Phase{kind, 1, "2026-11-01T00:00:00Z", "2026-11-01T01:00:00Z", "2026-11-01T02:00:00Z", "2026-11-01T03:00:00Z", strings.Repeat("d", 64), strings.Repeat("e", 64)},
			Phase{kind, 2, "2026-11-02T00:00:00Z", "2026-11-02T01:00:00Z", "2026-11-02T02:00:00Z", "2026-11-02T03:00:00Z", strings.Repeat("d", 64), strings.Repeat("e", 64)})
	}
	return encode(t, f.plan), e
}

func TestExecutionValidation(t *testing.T) {
	plan, e := executionFixture(t)
	data := encode(t, e)
	if _, err := ValidateExecution(plan, Digest(plan), data, Digest(data)); err != nil {
		t.Fatal(err)
	}
	cases := map[string]func(*Execution){
		"schema":              func(e *Execution) { e.Schema = "production-approved" },
		"plan":                func(e *Execution) { e.PlanSHA256 = strings.Repeat("f", 64) },
		"missing-participant": func(e *Execution) { e.Participants = e.Participants[:1] },
		"order":               func(e *Execution) { e.Participants[0], e.Participants[1] = e.Participants[1], e.Participants[0] },
		"duplicate-key":       func(e *Execution) { e.Participants[1].PublicKey = e.Participants[0].PublicKey },
		"zero-key":            func(e *Execution) { e.Participants[0].PublicKey = strings.Repeat("0", 64) },
		"key-format":          func(e *Execution) { e.Participants[0].PublicKey = "ABC" },
		"memory":              func(e *Execution) { e.Resources.MemoryBytes = 0 },
		"memory-overflow":     func(e *Execution) { e.Resources.MemoryBytes = 1 << 41 },
		"transcript":          func(e *Execution) { e.Resources.TranscriptBytes = 0 },
		"storage":             func(e *Execution) { e.Resources.StorageBytes = 1 },
		"wall":                func(e *Execution) { e.Resources.WallSeconds = 604801 },
		"cpu":                 func(e *Execution) { e.Resources.CPUCount = 0 },
		"missing-phase":       func(e *Execution) { e.Phases = e.Phases[:3] },
		"duplicate-phase":     func(e *Execution) { e.Phases[1] = e.Phases[0] },
		"kind":                func(e *Execution) { e.Phases[0].Circuit = "other" },
		"phase":               func(e *Execution) { e.Phases[0].Phase = 3 },
		"early-beacon":        func(e *Execution) { e.Phases[0].BeaconNotBefore = e.Phases[0].ClosesAt },
		"deadline":            func(e *Execution) { e.Phases[0].BeaconDeadline = e.Phases[0].BeaconNotBefore },
		"empty-window":        func(e *Execution) { e.Phases[0].OpensAt = e.Phases[0].ClosesAt },
		"timestamp":           func(e *Execution) { e.Phases[0].ClosesAt = "2026-11-01T01:00:00+00:00" },
		"phase-overlap":       func(e *Execution) { e.Phases[1].OpensAt = e.Phases[0].BeaconDeadline },
		"beacon-policy":       func(e *Execution) { e.Phases[0].BeaconPolicySHA256 = "" },
		"closure-policy":      func(e *Execution) { e.Phases[0].ClosurePolicySHA256 = "" },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			plan, e := executionFixture(t)
			mutate(&e)
			data := encode(t, e)
			if _, err := ValidateExecution(plan, Digest(plan), data, Digest(data)); err == nil {
				t.Fatal("invalid execution accepted")
			}
		})
	}
	for name, altered := range map[string][]byte{
		"unknown":   append([]byte(`{"unknown":1,`), data[1:]...),
		"duplicate": append([]byte(`{"schema":"x",`), data[1:]...),
		"trailing":  append(append([]byte{}, data...), []byte(` {}`)...),
		"null":      []byte(`null`),
		"oversize":  []byte(strings.Repeat(" ", MaxDocumentBytes+1)),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := ValidateExecution(plan, Digest(plan), altered, Digest(altered)); err == nil {
				t.Fatal("invalid JSON accepted")
			}
		})
	}
	if _, err := ValidateExecution(plan, Digest(plan), data, strings.Repeat("0", 64)); err == nil {
		t.Fatal("bad execution pin accepted")
	}
	if _, err := ValidateExecution(plan, strings.Repeat("0", 64), data, Digest(data)); err == nil {
		t.Fatal("bad plan pin accepted")
	}
}

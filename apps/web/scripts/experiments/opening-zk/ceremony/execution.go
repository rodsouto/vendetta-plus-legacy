package ceremony

import (
	"errors"
	"fmt"
)

// Execution is a pinned scheduling proposal, never permission to run MPC.
// Resource values are ceilings to be enforced by a future external supervisor.
type Execution struct {
	Schema       string     `json:"schema"`
	PlanSHA256   string     `json:"planSha256"`
	Participants []Reviewer `json:"participants"`
	Resources    Resources  `json:"resources"`
	Phases       []Phase    `json:"phases"`
}

type Resources struct {
	MemoryBytes     uint64 `json:"memoryBytes"`
	TranscriptBytes uint64 `json:"transcriptBytes"`
	StorageBytes    uint64 `json:"storageBytes"`
	WallSeconds     uint64 `json:"wallSeconds"`
	CPUCount        uint64 `json:"cpuCount"`
}

type Phase struct {
	Circuit         string `json:"circuit"`
	Phase           uint64 `json:"phase"`
	OpensAt         string `json:"opensAt"`
	ClosesAt        string `json:"closesAt"`
	BeaconNotBefore string `json:"beaconNotBefore"`
	BeaconDeadline  string `json:"beaconDeadline"`
	// These pins identify a proposed authentication policy and publication
	// procedure. Inspect does not read or authenticate either document.
	BeaconPolicySHA256  string `json:"beaconPolicySha256"`
	ClosurePolicySHA256 string `json:"closurePolicySha256"`
}

// ValidateExecution checks only structure and binding to a pinned design plan.
// No clock-dependent freshness check: archived schedules remain inspectable.
func ValidateExecution(planData []byte, planPin string, data []byte, expected string) (Execution, error) {
	var e Execution
	plan, err := ValidatePlan(planData, planPin)
	if err != nil {
		return e, err
	}
	if err := pin(data, expected); err != nil {
		return e, err
	}
	if err := strictJSON(data, &e); err != nil {
		return e, err
	}
	if e.Schema != "vendetta-hidden-v2-execution-plan-1" || e.PlanSHA256 != planPin || len(e.Participants) != len(plan.Participants) {
		return e, errors.New("execution must bind the complete design plan")
	}
	keys := map[string]bool{}
	for i, p := range e.Participants {
		_, keyErr := ParsePublicKey(p.PublicKey)
		if p.ID != plan.Participants[i] || keyErr != nil || keys[p.PublicKey] {
			return e, errors.New("participant order or distinct Ed25519 public keys invalid")
		}
		keys[p.PublicKey] = true
	}
	r := e.Resources
	// Conservative format ceilings, not measured requirements for game domains.
	if r.MemoryBytes < 1<<20 || r.MemoryBytes > 1<<40 || r.TranscriptBytes == 0 || r.TranscriptBytes > 1<<40 ||
		r.StorageBytes < r.TranscriptBytes || r.StorageBytes > 1<<44 || r.WallSeconds == 0 || r.WallSeconds > 604800 || r.CPUCount == 0 || r.CPUCount > 1024 {
		return e, errors.New("resource budgets outside execution format bounds")
	}
	if len(e.Phases) != 4 {
		return e, errors.New("execution requires two phases per circuit")
	}
	seen := map[string]Phase{}
	for _, p := range e.Phases {
		if (p.Circuit != "opening" && p.Circuit != "invalid-point") || (p.Phase != 1 && p.Phase != 2) ||
			!hashPattern.MatchString(p.BeaconPolicySHA256) || !hashPattern.MatchString(p.ClosurePolicySHA256) {
			return e, errors.New("invalid phase or external policy pin")
		}
		key := fmt.Sprintf("%s/%d", p.Circuit, p.Phase)
		if _, ok := seen[key]; ok {
			return e, errors.New("duplicate execution phase")
		}
		opens, a := timestamp(p.OpensAt)
		closes, b := timestamp(p.ClosesAt)
		beacon, c := timestamp(p.BeaconNotBefore)
		deadline, d := timestamp(p.BeaconDeadline)
		if a != nil || b != nil || c != nil || d != nil || !opens.Before(closes) || !closes.Before(beacon) || !beacon.Before(deadline) {
			return e, errors.New("phase must close before beacon availability and deadline")
		}
		seen[key] = p
	}
	for _, kind := range []string{"opening", "invalid-point"} {
		end, _ := timestamp(seen[kind+"/1"].BeaconDeadline)
		start, _ := timestamp(seen[kind+"/2"].OpensAt)
		if !end.Before(start) {
			return e, errors.New("phase two must follow phase one beacon deadline")
		}
	}
	return e, nil
}

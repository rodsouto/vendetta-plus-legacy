package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/constraint"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

// This entry point deliberately has no setup, key loading or native CS decoding.
// Run it under an external resource supervisor; it imposes no resource limits.
func compileProducerCS(kind, output string) {
	shape := producerShape(kind) // Reject unknown kinds before creating output.
	f, err := os.OpenFile(output, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	check(err)
	defer f.Close()
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, shape)
	check(err)
	report, err := describeProducerCS(cs)
	check(err)
	report["kind"] = kind
	report["productionApproved"] = false
	report["gameDomainMpcMeasured"] = false
	report["phase2Measured"] = false
	check(json.NewEncoder(f).Encode(report))
	check(f.Sync())
}

func describeProducerCS(cs constraint.ConstraintSystem) (map[string]any, error) {
	commitments, ok := cs.GetCommitments().(constraint.Groth16Commitments)
	if !ok {
		return nil, fmt.Errorf("expected Groth16 commitments")
	}
	// Emit dimensions, not potentially huge lists of committed wire indexes.
	commitmentDimensions := make([]map[string]int, len(commitments))
	for i, c := range commitments {
		commitmentDimensions[i] = map[string]int{
			"privateCommitted":             len(c.PrivateCommitted),
			"publicAndCommitmentCommitted": len(c.PublicAndCommitmentCommitted),
			"publicCommitted":              c.NbPublicCommitted,
			"commitmentIndex":              c.CommitmentIndex,
		}
	}
	h := sha256.New()
	n, err := cs.WriteTo(h)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"schema": "vendetta-hidden-v2-compiled-cs-1",
		"sha256": hex.EncodeToString(h.Sum(nil)), "bytes": n,
		"constraints":       cs.GetNbConstraints(),
		"domain":            ecc.NextPowerOfTwo(uint64(cs.GetNbConstraints())),
		"publicInputs":      cs.GetNbPublicVariables() - 1,
		"secretVariables":   cs.GetNbSecretVariables(),
		"internalVariables": cs.GetNbInternalVariables(),
		"commitments":       commitmentDimensions,
	}, nil
}

package main

import (
	"github.com/consensys/gnark/frontend"
)

// Canonical profile with authenticated beacon, age, mission predicate and context.
// External H3 MUST still be checked against the exact completed prefix by the consumer.
// This does not extend the accepted JSON/age profiles or cover exhausted H3.
type PaginatedMissionOpeningCircuit struct {
	Mission      MissionOpeningCircuit
	PrePacked    [2]frontend.Variable `gnark:",public"`
	ScalarPacked [2]frontend.Variable `gnark:",public"`
}

func (c *PaginatedMissionOpeningCircuit) Define(api frontend.API) error {
	ext := &externalH3{}
	for _, p := range c.PrePacked {
		ext.pre = append(ext.pre, unpack128(api, p)...)
	}
	for _, p := range c.ScalarPacked {
		ext.scalar = append(ext.scalar, unpack128(api, p)...)
	}
	return c.Mission.defineWithExternalH3(api, ext)
}

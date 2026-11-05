package main

import (
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/std/math/cmp"
	"github.com/consensys/gnark/std/math/uints"
)

// A separate research relation: the exact stored v2 packet has an unusable U.
// Two public inputs are the complete 256-bit immutable mission statement digest.
// No beacon, signature, file key, H3 receipt or sender cooperation is required.
// Consumers still must pin this verifier/version and look up the original statement.
type InvalidPointMissionV2Circuit struct {
	Context      MissionContext
	PacketPacked [18]frontend.Variable
	Decode       G2DecodeWitness
}

func (c *InvalidPointMissionV2Circuit) Define(api frontend.API) error {
	if err := c.Context.defineWithDomain(api, "VENDETTA_OPENING_V2"); err != nil {
		return err
	}
	packet := unpackPadded(api, c.PacketPacked[:], 273)
	u, err := uints.NewBytes(api)
	if err != nil {
		return err
	}
	prefix := uints.NewU8Array(append([]byte("VDH2"), mustHex(quicknetHash)...))
	api.AssertIsEqual(sameBytes(api, packet[:36], prefix), 1)
	var round frontend.Variable = 0
	for _, b := range packet[36:44] {
		round = api.Add(api.Mul(round, 256), u.Value(b))
	}
	api.AssertIsEqual(cmp.IsLessOrEqual(api, round, 9007199254740991), 1)
	api.AssertIsDifferent(round, 0)
	api.AssertIsEqual(c.Context.Words[15][1], round)
	api.AssertIsEqual(sameBytes(api, keccakBytes(api, packet), wordBytes(api, c.Context.Words[19])), 1)
	valid, err := compressedG2Valid(api, packet[44:140], &c.Decode)
	if err != nil {
		return err
	}
	api.AssertIsEqual(valid, 0)
	return nil
}

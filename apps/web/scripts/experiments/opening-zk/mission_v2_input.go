package main

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/consensys/gnark/frontend"
	"strings"
)

// Fixed offline fixture assignment; source coordinates and target slots in these vectors use row zero.
func missionV2Assignment(raw json.RawMessage) (*MissionV2Circuit, bool, error) {
	var age ageVector
	var cap capsuleVector
	var v missionVector
	var metadata struct {
		PacketHash             string
		Expected               string
		NativeInteroperability bool
	}
	for _, target := range []any{&age, &cap, &v, &metadata} {
		if err := json.Unmarshal(raw, target); err != nil {
			return nil, false, err
		}
	}
	if !metadata.NativeInteroperability {
		return nil, false, fmt.Errorf("missing native check")
	}
	age.CiphertextHash = metadata.PacketHash
	ageA, err := ageAssignment(age)
	if err != nil {
		return nil, false, err
	}
	kem, err := compactCapsuleAssignment(cap)
	if err != nil {
		return nil, false, err
	}
	ext, err := paginatedAssignment(cap)
	if err != nil {
		return nil, false, err
	}
	ctx, err := contextAssignment(v)
	if err != nil {
		return nil, false, err
	}
	opening := CapsuleAgeCircuit{KEM: *kem, Age: *ageA, Round: 1000, RoundDecimal: make([]frontend.Variable, 16), CodecV2: true}
	for i := range opening.RoundDecimal {
		opening.RoundDecimal[i] = 0
	}
	opening.RoundDecimal[12] = 1
	hash, err := hex.DecodeString(strings.TrimPrefix(metadata.PacketHash, "0x"))
	if err != nil {
		return nil, false, err
	}
	copy(opening.CiphertextHashPacked[:], packBytes(hash))
	return &MissionV2Circuit{Opening: AuthenticatedOpeningCircuit{Opening: opening}, Context: ctx, FromRow: 0, TargetRow: 0, Valid: 1, PrePacked: ext.PrePacked, ScalarPacked: ext.ScalarPacked}, metadata.Expected == "valid", nil
}

package main

import (
	"encoding/hex"
	"fmt"
	"strings"
)

// Rebinding is fixture preparation only: a real consumer must use the statement
// fixed by the Game when the packet was admitted, never a prover-supplied root.
func invalidPointV2Assignment(base missionVector, packet []byte, rebind bool) (*InvalidPointMissionV2Circuit, error) {
	if len(packet) != 273 {
		return nil, fmt.Errorf("invalid v2 packet length")
	}
	if rebind {
		encoded, err := hex.DecodeString(strings.TrimPrefix(base.ABI, "0x"))
		if err != nil {
			return nil, err
		}
		if len(encoded) != 640 {
			return nil, fmt.Errorf("invalid context length")
		}
		copy(encoded[19*32:], nativeKeccak(packet))
		base.ABI = "0x" + hex.EncodeToString(encoded)
		base.Statement = "0x" + hex.EncodeToString(nativeKeccak(encoded))
	}
	ctx, err := contextAssignment(base)
	if err != nil {
		return nil, err
	}
	decoded, err := decodeG2Assignment(packet[44:140])
	if err != nil {
		return nil, err
	}
	a := &InvalidPointMissionV2Circuit{Context: ctx, Decode: decoded}
	copy(a.PacketPacked[:], packBytes(packet))
	return a, nil
}

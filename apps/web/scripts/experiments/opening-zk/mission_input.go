package main

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"os"
	"strings"

	"github.com/consensys/gnark/frontend"
)

type missionVector struct {
	Name, ABI, Statement, Plain, Expected, Profile string
	Kind                                           int
	Decimals                                       [4]string
	Context                                        struct {
		From struct{ City, Neighborhood, Slot string }
	}
}

func readMissionVectors(path string) ([]missionVector, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var input struct {
		RulesDigest, RulesetLabel string
		World                     struct{ Cities, Neighborhoods, Slots, GridColumns, GridRows string }
		Protocol                  struct{ Genesis, Period, HeadStart int }
		Vectors                   []missionVector
	}
	if err = json.Unmarshal(data, &input); err != nil {
		return nil, err
	}
	if err = checkMissionRulePin(input.RulesDigest, input.World.Cities, input.World.Neighborhoods, input.World.Slots, input.World.GridColumns, input.World.GridRows); err != nil {
		return nil, err
	}
	if input.RulesetLabel != missionRulesetLabel || input.Protocol.Genesis != 1692803367 || input.Protocol.Period != 3 || input.Protocol.HeadStart != 15 {
		return nil, fmt.Errorf("unsupported mission protocol profile")
	}
	if len(input.Vectors) != 26 {
		return nil, fmt.Errorf("expected 26 mission vectors")
	}
	return input.Vectors, nil
}
func contextAssignment(v missionVector) (MissionContext, error) {
	var c MissionContext
	abi, err := hex.DecodeString(strings.TrimPrefix(v.ABI, "0x"))
	if err != nil {
		return c, err
	}
	if len(abi) != 640 {
		return c, fmt.Errorf("expected twenty ABI words")
	}
	for i := range c.Words {
		copy(c.Words[i][:], packBytes(abi[32*i:32*(i+1)]))
	}
	digest, err := hex.DecodeString(strings.TrimPrefix(v.Statement, "0x"))
	if err != nil {
		return c, err
	}
	if len(digest) != 32 {
		return c, fmt.Errorf("bad statement digest")
	}
	copy(c.StatementPacked[:], packBytes(digest))
	return c, nil
}
func messageWitness(v missionVector) (CanonicalMessageWitness, error) {
	m := CanonicalMessageWitness{Kind: v.Kind}
	for i, text := range v.Decimals {
		if len(text) < 1 || len(text) > 78 {
			return m, fmt.Errorf("unsupported decimal length")
		}
		m.Digits[i] = make([]frontend.Variable, len(text))
		for j, d := range []byte(text) {
			if d < '0' || d > '9' {
				return m, fmt.Errorf("unsupported decimal format")
			}
			m.Digits[i][j] = int(d - '0')
		}
	}
	from, ok := new(big.Int).SetString(v.Context.From.Slot, 10)
	if !ok {
		return m, fmt.Errorf("invalid source slot")
	}
	from.Sub(from, big.NewInt(1))
	from.Div(from, big.NewInt(17))
	m.FromRow = from
	target, ok := new(big.Int).SetString(v.Decimals[2], 10)
	if !ok {
		return m, fmt.Errorf("invalid target slot")
	}
	// Match the circuit's dummy geometry for out-of-domain coordinates. The full decimal
	// and its overflow flag remain constrained separately; this does not admit truncated data.
	target.And(target, new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 256), big.NewInt(1)))
	if target.Sign() > 0 && target.Cmp(big.NewInt(255)) <= 0 {
		target.Sub(target, big.NewInt(1))
		target.Div(target, big.NewInt(17))
		m.TargetRow = target
	} else {
		m.TargetRow = 0
	}
	return m, nil
}
func messageShape(v missionVector) *MessageCircuit {
	c := &MessageCircuit{PlainLength: len(v.Plain) / 2, PlainPacked: make([]frontend.Variable, (len(v.Plain)/2+15)/16)}
	for i, d := range v.Decimals {
		c.Message.Digits[i] = make([]frontend.Variable, len(d))
	}
	return c
}
func messageAssignment(v missionVector) (*MessageCircuit, error) {
	c := messageShape(v)
	var err error
	c.Context, err = contextAssignment(v)
	if err != nil {
		return nil, err
	}
	c.Message, err = messageWitness(v)
	if err != nil {
		return nil, err
	}
	raw, err := hex.DecodeString(v.Plain)
	if err != nil {
		return nil, err
	}
	c.PlainPacked = packBytes(raw)
	c.CryptoValid = 1
	c.Valid = 0
	if v.Expected == "valid" {
		c.Valid = 1
	}
	return c, nil
}

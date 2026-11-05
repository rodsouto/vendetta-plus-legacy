package main

import (
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/std/math/uints"
)

// Fixed codec domain. Each byte string has one shape; no JSON length profiles.
// H3 still requires the completed exact external prefix in the final consumer.
type MissionV2Circuit struct {
	Opening      AuthenticatedOpeningCircuit
	Context      MissionContext
	FromRow      frontend.Variable
	TargetRow    frontend.Variable
	Valid        frontend.Variable    `gnark:",public"`
	PrePacked    [2]frontend.Variable `gnark:",public"`
	ScalarPacked [2]frontend.Variable `gnark:",public"`
}

func (c *MissionV2Circuit) Define(api frontend.API) error {
	if !c.Opening.Opening.CodecV2 {
		panic("v2 requires fixed packet shape")
	}
	ext := &externalH3{}
	for _, p := range c.PrePacked {
		ext.pre = append(ext.pre, unpack128(api, p)...)
	}
	for _, p := range c.ScalarPacked {
		ext.scalar = append(ext.scalar, unpack128(api, p)...)
	}
	if err := c.Opening.defineWithExternalH3(api, ext); err != nil {
		return err
	}
	if err := c.Context.defineWithDomain(api, "VENDETTA_OPENING_V2"); err != nil {
		return err
	}
	o := &c.Opening.Opening
	api.AssertIsEqual(c.Context.Words[15][1], o.Round)
	for i := 0; i < 2; i++ {
		api.AssertIsEqual(c.Context.Words[19][i], o.CiphertextHashPacked[i])
	}
	api.AssertIsBoolean(c.Valid)
	plain := unpackPadded(api, o.Age.PlainPacked, 37)
	u, err := uints.NewBytes(api)
	if err != nil {
		return err
	}
	var values [4]decimalValue
	for i := 0; i < 3; i++ {
		bytes := uints.NewU8Array(make([]byte, 32))
		bytes[31] = plain[i+2]
		values[i] = decimalValue{Word: [2]frontend.Variable{0, u.Value(plain[i+2])}, Bytes: bytes, Domain: 1}
	}
	salt := plain[5:]
	packed := func(b []uints.U8) frontend.Variable {
		var v frontend.Variable = 0
		for _, x := range b {
			v = api.Add(api.Mul(v, 256), u.Value(x))
		}
		return v
	}
	values[3] = decimalValue{Word: [2]frontend.Variable{packed(salt[:16]), packed(salt[16:])}, Bytes: salt, Domain: 1}
	crypto := api.And(o.KEM.CapsuleValid, api.And(o.Age.HeaderValid, o.Age.PayloadValid))
	format := api.IsZero(api.Sub(u.Value(plain[0]), 2))
	return defineMissionPredicate(api, c.Context, u.Value(plain[1]), values, c.FromRow, c.TargetRow, api.And(crypto, format), c.Valid)
}

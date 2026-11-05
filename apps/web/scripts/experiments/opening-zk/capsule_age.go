// Joins the compact KEM and age relations with a shared key and canonical header bytes.
// Canonical single-chunk profile only; still lacks beacon authentication and mission rules.
package main

import (
	"fmt"

	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/std/hash/sha3"
	"github.com/consensys/gnark/std/math/cmp"
	"github.com/consensys/gnark/std/math/uints"
)

const quicknetHash = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971"

type CapsuleAgeCircuit struct {
	CiphertextHashPacked [2]frontend.Variable `gnark:",public"`
	KEM                  CompactCapsuleCircuit
	Age                  AgeCircuit
	Round                frontend.Variable `gnark:",public"`
	RoundDecimal         []frontend.Variable
	CodecV2              bool `gnark:"-"`
}

func base64Unpadded(api frontend.API, data []uints.U8) []uints.U8 {
	u, err := uints.NewBytes(api)
	if err != nil {
		panic(err)
	}
	var bs []frontend.Variable
	for _, b := range data {
		little := u.ToBits(b)
		for i := 7; i >= 0; i-- {
			bs = append(bs, little[i])
		}
	}
	for len(bs)%6 != 0 {
		bs = append(bs, 0)
	}
	out := make([]uints.U8, len(bs)/6)
	for i := range out {
		be := bs[6*i : 6*(i+1)]
		le := make([]frontend.Variable, 6)
		for j := range le {
			le[j] = be[5-j]
		}
		index := api.FromBinary(le...)
		below26 := cmp.IsLessBinary(api, le, constantBitsFromUint(26, 6))
		below52 := cmp.IsLessBinary(api, le, constantBitsFromUint(52, 6))
		below62 := cmp.IsLessBinary(api, le, constantBitsFromUint(62, 6))
		value := api.Select(below26, api.Add(index, 65), api.Select(below52, api.Add(index, 71), api.Select(below62, api.Sub(index, 4), api.Select(api.IsZero(api.Sub(index, 62)), 43, 47))))
		out[i] = u.ValueOf(value)
	}
	return out
}
func constantBitsFromUint(n uint64, count int) []frontend.Variable {
	out := make([]frontend.Variable, count)
	for i := range out {
		out[i] = (n >> i) & 1
	}
	return out
}

func canonicalArmor(api frontend.API, raw []uints.U8) []uints.U8 {
	encoded := base64Unpadded(api, raw)
	for (len(encoded) % 4) != 0 {
		encoded = append(encoded, uints.NewU8('='))
	}
	out := uints.NewU8Array([]byte("-----BEGIN AGE ENCRYPTED FILE-----\n"))
	for i, b := range encoded {
		out = append(out, b)
		if (i+1)%64 == 0 || i == len(encoded)-1 {
			out = append(out, uints.NewU8('\n'))
		}
	}
	return append(out, uints.NewU8Array([]byte("-----END AGE ENCRYPTED FILE-----\n"))...)
}

func (c *CapsuleAgeCircuit) Define(api frontend.API) error {
	return c.defineWithExternalH3(api, nil)
}

func (c *CapsuleAgeCircuit) defineWithExternalH3(api frontend.API, external *externalH3) error {
	if len(c.RoundDecimal) < 1 || len(c.RoundDecimal) > 16 {
		return fmt.Errorf("unsupported decimal round profile")
	}
	api.ToBinary(c.Round, 53)
	var round frontend.Variable = 0
	digits := make([]uints.U8, len(c.RoundDecimal))
	u, err := uints.NewBytes(api)
	if err != nil {
		return err
	}
	for i, d := range c.RoundDecimal {
		bits := api.ToBinary(d, 4)
		api.AssertIsEqual(cmp.IsLessBinary(api, bits, constantBitsFromUint(10, 4)), 1)
		if i == 0 && !c.CodecV2 {
			api.AssertIsDifferent(d, 0)
		}
		round = api.Add(api.Mul(round, 10), d)
		digits[i] = u.ValueOf(api.Add(d, 48))
	}
	api.AssertIsEqual(round, c.Round)
	if c.CodecV2 {
		if len(c.RoundDecimal) != 16 || c.Age.PlainLength != 37 {
			return fmt.Errorf("invalid v2 fixed shape")
		}
		api.AssertIsDifferent(c.Round, 0)
	}
	api.AssertIsEqual(c.KEM.FileKeyPacked, c.Age.FileKeyPacked)
	if err = c.KEM.defineWithExternalH3(api, external); err != nil {
		return err
	}
	if err = c.Age.Define(api); err != nil {
		return err
	}
	// Compare every header byte; a freely supplied pre-parsed header cannot select another KEM.
	header := uints.NewU8Array([]byte("age-encryption.org/v1\n-> tlock "))
	header = append(header, digits...)
	header = append(header, uints.NewU8Array([]byte(" "+quicknetHash+"\n"))...)
	capsule := unpackPadded(api, c.KEM.CapsulePacked[:], 128)
	encoded := base64Unpadded(api, capsule)
	for i, b := range encoded {
		header = append(header, b)
		if (i+1)%64 == 0 || i == len(encoded)-1 {
			header = append(header, uints.NewU8('\n'))
		}
	}
	header = append(header, uints.NewU8Array([]byte("---"))...)
	if len(header) != c.Age.HeaderLength {
		return fmt.Errorf("noncanonical header profile")
	}
	api.AssertIsEqual(sameBytes(api, header, unpackPadded(api, c.Age.HeaderPacked, c.Age.HeaderLength)), 1)
	// Reconstruct the exact canonical client ciphertext before hashing, including armor and padding.
	raw := append([]uints.U8(nil), header...)
	raw = append(raw, uints.NewU8(' '))
	raw = append(raw, base64Unpadded(api, unpackPadded(api, c.Age.MacPacked[:], 32))...)
	raw = append(raw, uints.NewU8('\n'))
	raw = append(raw, unpackPadded(api, c.Age.BodyPacked, c.Age.PlainLength+32)...)
	h, err := sha3.NewLegacyKeccak256(api)
	if err != nil {
		return err
	}
	if c.CodecV2 {
		roundBits := api.ToBinary(c.Round, 64)
		packet := uints.NewU8Array([]byte("VDH2"))
		packet = append(packet, uints.NewU8Array(mustHex(quicknetHash))...)
		for i := 7; i >= 0; i-- {
			packet = append(packet, u.FromBits(roundBits[8*i:8*(i+1)]...))
		}
		packet = append(packet, capsule...)
		packet = append(packet, unpackPadded(api, c.Age.MacPacked[:], 32)...)
		packet = append(packet, unpackPadded(api, c.Age.BodyPacked, 69)...)
		h.Write(packet)
	} else {
		h.Write(canonicalArmor(api, raw))
	}
	api.AssertIsEqual(sameBytes(api, h.Sum(), unpackPadded(api, c.CiphertextHashPacked[:], 32)), 1)
	return nil
}

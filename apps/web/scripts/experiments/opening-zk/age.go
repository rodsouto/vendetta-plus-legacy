// Research-only age/v1 single STREAM chunk, with explicit authentication results.
package main

import (
	"encoding/binary"
	"fmt"
	"math/big"

	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/std/math/emulated"
	"github.com/consensys/gnark/std/math/uints"
)

// Poly1305 uses arithmetic modulo 2^130-5, followed by a separate modulo-2^128 tag.
type polyField struct{}

func (polyField) NbLimbs() uint     { return 3 }
func (polyField) BitsPerLimb() uint { return 44 }
func (polyField) IsPrime() bool     { return true }
func (polyField) Modulus() *big.Int {
	return new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 130), big.NewInt(5))
}

func hmacBytes(api frontend.API, key, message []uints.U8) []uints.U8 {
	if len(key) > 64 {
		key = shaBytes(api, key)
	}
	u, err := uints.NewBytes(api)
	if err != nil {
		panic(err)
	}
	inner, outer := make([]uints.U8, 64), make([]uints.U8, 64)
	for i := range inner {
		k := uints.NewU8(0)
		if i < len(key) {
			k = key[i]
		}
		inner[i] = u.Xor(k, uints.NewU8(0x36))
		outer[i] = u.Xor(k, uints.NewU8(0x5c))
	}
	return shaBytes(api, outer, shaBytes(api, inner, message))
}

func hkdf32(api frontend.API, key, salt []uints.U8, info string) []uints.U8 {
	prk := hmacBytes(api, salt, key)
	return hmacBytes(api, prk, uints.NewU8Array(append([]byte(info), 1)))
}

func chachaBlock(api frontend.API, key []uints.U8, nonce []uints.U8, counter uint32) []uints.U8 {
	if len(key) != 32 || len(nonce) != 12 {
		panic("bad ChaCha parameters")
	}
	u, err := uints.NewBinaryField[uints.U32](api)
	if err != nil {
		panic(err)
	}
	var initial [16]uints.U32
	initial[0] = uints.NewU32(0x61707865)
	initial[1] = uints.NewU32(0x3320646e)
	initial[2] = uints.NewU32(0x79622d32)
	initial[3] = uints.NewU32(0x6b206574)
	for i := 0; i < 8; i++ {
		copy(initial[4+i][:], key[4*i:4*(i+1)])
	}
	initial[12] = uints.NewU32(counter)
	for i := 0; i < 3; i++ {
		copy(initial[13+i][:], nonce[4*i:4*(i+1)])
	}
	state := initial
	qr := func(a, b, c, d int) {
		state[a] = u.Add(state[a], state[b])
		state[d] = u.Lrot(u.Xor(state[d], state[a]), 16)
		state[c] = u.Add(state[c], state[d])
		state[b] = u.Lrot(u.Xor(state[b], state[c]), 12)
		state[a] = u.Add(state[a], state[b])
		state[d] = u.Lrot(u.Xor(state[d], state[a]), 8)
		state[c] = u.Add(state[c], state[d])
		state[b] = u.Lrot(u.Xor(state[b], state[c]), 7)
	}
	for i := 0; i < 10; i++ {
		qr(0, 4, 8, 12)
		qr(1, 5, 9, 13)
		qr(2, 6, 10, 14)
		qr(3, 7, 11, 15)
		qr(0, 5, 10, 15)
		qr(1, 6, 11, 12)
		qr(2, 7, 8, 13)
		qr(3, 4, 9, 14)
	}
	out := make([]uints.U8, 0, 64)
	for i := range state {
		word := u.Add(state[i], initial[i])
		out = append(out, word[:]...)
	}
	return out
}

func leBits(u *uints.Bytes, data []uints.U8) []frontend.Variable {
	var out []frontend.Variable
	for _, b := range data {
		out = append(out, u.ToBits(b)...)
	}
	return out
}

func poly1305(api frontend.API, message, key []uints.U8) []uints.U8 {
	if len(key) != 32 {
		panic("bad Poly1305 key")
	}
	u, err := uints.NewBytes(api)
	if err != nil {
		panic(err)
	}
	f, err := emulated.NewField[polyField](api)
	if err != nil {
		panic(err)
	}
	rBytes := append([]uints.U8(nil), key[:16]...)
	for _, i := range []int{3, 7, 11, 15} {
		rBytes[i] = u.And(rBytes[i], uints.NewU8(15))
	}
	for _, i := range []int{4, 8, 12} {
		rBytes[i] = u.And(rBytes[i], uints.NewU8(252))
	}
	r := f.FromBits(leBits(u, rBytes)...)
	acc := f.Zero()
	for offset := 0; offset < len(message); offset += 16 {
		end := offset + 16
		if end > len(message) {
			end = len(message)
		}
		// The appended high bit is present even for a full 16-byte block.
		block := f.FromBits(append(leBits(u, message[offset:end]), frontend.Variable(1))...)
		acc = f.Mul(f.Add(acc, block), r)
	}
	accBits := f.ToBitsCanonical(acc)
	sum := api.Add(api.FromBinary(accBits...), api.FromBinary(leBits(u, key[16:])...))
	tagBits := api.ToBinary(sum, 131)
	tag := make([]uints.U8, 16)
	for i := range tag {
		tag[i] = u.FromBits(tagBits[8*i : 8*(i+1)]...)
	}
	return tag
}

func sameBytes(api frontend.API, a, b []uints.U8) frontend.Variable {
	if len(a) != len(b) {
		panic("byte lengths differ")
	}
	u, err := uints.NewBytes(api)
	if err != nil {
		panic(err)
	}
	var equal frontend.Variable = 1
	for i := range a {
		equal = api.And(equal, api.IsZero(api.Sub(u.Value(a[i]), u.Value(b[i]))))
	}
	return equal
}

// AEAD authenticates ciphertext, not the revealed plaintext. Empty AAD is age's profile.
func agePayload(api frontend.API, key, salt, ciphertext []uints.U8) (plain, tag []uints.U8) {
	payloadKey := hkdf32(api, key, salt, "payload")
	nonce := uints.NewU8Array(make([]byte, 12))
	nonce[11] = uints.NewU8(1)
	first := chachaBlock(api, payloadKey, nonce, 0)
	u, err := uints.NewBytes(api)
	if err != nil {
		panic(err)
	}
	plain = make([]uints.U8, len(ciphertext))
	for offset := 0; offset < len(ciphertext); offset += 64 {
		block := chachaBlock(api, payloadKey, nonce, uint32(offset/64+1))
		for i := 0; i < 64 && offset+i < len(ciphertext); i++ {
			plain[offset+i] = u.Xor(ciphertext[offset+i], block[i])
		}
	}
	macInput := append([]uints.U8(nil), ciphertext...)
	for len(macInput)%16 != 0 {
		macInput = append(macInput, uints.NewU8(0))
	}
	lengths := make([]byte, 16)
	binary.LittleEndian.PutUint64(lengths[8:], uint64(len(ciphertext)))
	macInput = append(macInput, uints.NewU8Array(lengths)...)
	return plain, poly1305(api, macInput, first[:32])
}

// Fixed lengths identify a research circuit profile, never mission-invalidity rules.
type AgeCircuit struct {
	FileKeyPacked frontend.Variable    `gnark:",public"`
	HeaderPacked  []frontend.Variable  `gnark:",public"`
	MacPacked     [2]frontend.Variable `gnark:",public"`
	BodyPacked    []frontend.Variable  `gnark:",public"`
	PlainPacked   []frontend.Variable  `gnark:",public"`
	HeaderValid   frontend.Variable    `gnark:",public"`
	PayloadValid  frontend.Variable    `gnark:",public"`
	HeaderLength  int                  `gnark:"-"`
	PlainLength   int                  `gnark:"-"`
}

func unpackPadded(api frontend.API, packed []frontend.Variable, length int) []uints.U8 {
	if length < 0 || len(packed) != (length+15)/16 {
		panic("packed profile length mismatch")
	}
	var data []uints.U8
	for _, p := range packed {
		data = append(data, unpack128(api, p)...)
	}
	u, err := uints.NewBytes(api)
	if err != nil {
		panic(err)
	}
	for i := length; i < len(data); i++ {
		u.AssertIsEqual(data[i], uints.NewU8(0))
	}
	return data[:length]
}

func (c *AgeCircuit) Define(api frontend.API) error {
	if c.HeaderLength < 1 || c.HeaderLength > 4096 || c.PlainLength < 0 || c.PlainLength > 256 {
		return fmt.Errorf("unsupported research age profile")
	}
	key := unpack128(api, c.FileKeyPacked)
	header := unpackPadded(api, c.HeaderPacked, c.HeaderLength)
	mac := unpackPadded(api, c.MacPacked[:], 32)
	body := unpackPadded(api, c.BodyPacked, c.PlainLength+32)
	plain := unpackPadded(api, c.PlainPacked, c.PlainLength)
	headerKey := hkdf32(api, key, nil, "header")
	expectedMac := hmacBytes(api, headerKey, header)
	api.AssertIsBoolean(c.HeaderValid)
	api.AssertIsEqual(c.HeaderValid, sameBytes(api, expectedMac, mac))
	decoded, tag := agePayload(api, key, body[:16], body[16:len(body)-16])
	api.AssertIsBoolean(c.PayloadValid)
	api.AssertIsEqual(c.PayloadValid, sameBytes(api, tag, body[len(body)-16:]))
	// Even an unauthenticated payload has deterministic raw bytes; these are never a valid message
	// unless both authentication flags (and later mission predicates) are checked.
	u, err := uints.NewBytes(api)
	if err != nil {
		return err
	}
	for i := range plain {
		u.AssertIsEqual(decoded[i], plain[i])
	}
	return nil
}

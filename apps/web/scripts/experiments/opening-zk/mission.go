// Canonical message profile and immutable-context binding. Not a general JSON parser.
package main

import (
	"encoding/hex"
	"fmt"

	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/std/hash/sha3"
	"github.com/consensys/gnark/std/math/cmp"
	"github.com/consensys/gnark/std/math/uints"
	nativeSHA3 "golang.org/x/crypto/sha3"
)

const missionRulesDigest = "ca68555c4e55b79b4e357509f49c61947b4ceac1ed174d51350db9069a8d1f40"
const missionRulesetLabel = "vendetta-opening-research-v1"

type MissionContext struct {
	Words           [20][2]frontend.Variable
	StatementPacked [2]frontend.Variable `gnark:",public"`
}

func nativeKeccak(parts ...[]byte) []byte {
	h := nativeSHA3.NewLegacyKeccak256()
	for _, p := range parts {
		h.Write(p)
	}
	return h.Sum(nil)
}
func mustHex(s string) []byte {
	b, err := hex.DecodeString(s)
	if err != nil {
		panic(err)
	}
	return b
}
func wordBytes(api frontend.API, w [2]frontend.Variable) []uints.U8 {
	return unpackPadded(api, w[:], 32)
}
func keccakBytes(api frontend.API, b []uints.U8) []uints.U8 {
	h, err := sha3.NewLegacyKeccak256(api)
	if err != nil {
		panic(err)
	}
	h.Write(b)
	return h.Sum()
}
func assertConstantWord(api frontend.API, w [2]frontend.Variable, b []byte) {
	if len(b) != 32 {
		panic("not a word")
	}
	api.AssertIsEqual(sameBytes(api, wordBytes(api, w), uints.NewU8Array(b)), 1)
}
func (c *MissionContext) Define(api frontend.API) error {
	return c.defineWithDomain(api, "VENDETTA_OPENING_V1")
}

func (c *MissionContext) defineWithDomain(api frontend.API, domain string) error {
	var encoded []uints.U8
	for _, w := range c.Words {
		encoded = append(encoded, wordBytes(api, w)...)
	}
	assertConstantWord(api, c.Words[0], nativeKeccak([]byte(domain)))
	assertConstantWord(api, c.Words[4], nativeKeccak(nativeKeccak([]byte(missionRulesetLabel)), mustHex(missionRulesDigest)))
	assertConstantWord(api, c.Words[16], mustHex(quicknetHash))
	assertConstantWord(api, c.Words[17], nativeKeccak(mustHex(quicknetPublicKey)))
	u, err := uints.NewBytes(api)
	if err != nil {
		return err
	}
	address := wordBytes(api, c.Words[2])
	for _, b := range address[:12] {
		u.AssertIsEqual(b, uints.NewU8(0))
	}
	api.AssertIsEqual(sameBytes(api, keccakBytes(api, encoded), wordBytes(api, c.StatementPacked)), 1)
	api.AssertIsEqual(c.Words[14][0], 0)
	api.ToBinary(c.Words[14][1], 64)
	api.AssertIsEqual(c.Words[15][0], 0)
	api.ToBinary(c.Words[15][1], 53)
	api.AssertIsDifferent(c.Words[15][1], 0)
	// Keep the original arrival; no "now" is substituted when proving after a long outage.
	api.AssertIsEqual(api.Add(1692803367, api.Mul(api.Sub(c.Words[15][1], 1), 3)), api.Add(c.Words[14][1], 15))
	return nil
}

type CanonicalMessageWitness struct {
	Kind      frontend.Variable
	Digits    [4][]frontend.Variable // city, neighborhood, slot, salt
	FromRow   frontend.Variable
	TargetRow frontend.Variable
}

type decimalValue struct {
	Word   [2]frontend.Variable
	Bytes  []uints.U8
	Domain frontend.Variable
}

func canonicalDecimal(api frontend.API, digits []frontend.Variable) (decimalValue, []uints.U8) {
	if len(digits) < 1 || len(digits) > 78 {
		panic("unsupported decimal profile")
	}
	u, err := uints.NewBytes(api)
	if err != nil {
		panic(err)
	}
	var limbs [3]frontend.Variable
	for i := range limbs {
		limbs[i] = 0
	}
	text := make([]uints.U8, len(digits))
	for i, d := range digits {
		api.ToBinary(d, 4)
		api.AssertIsEqual(cmp.IsLessOrEqual(api, d, 9), 1)
		if i == 0 && len(digits) > 1 {
			api.AssertIsDifferent(d, 0)
		}
		text[i] = u.ValueOf(api.Add(d, 48))
		var carry frontend.Variable = d
		for j := range limbs {
			bs := api.ToBinary(api.Add(api.Mul(limbs[j], 10), carry), 100)
			limbs[j] = api.FromBinary(bs[:96]...)
			carry = api.FromBinary(bs[96:]...)
		}
		api.AssertIsEqual(carry, 0) // all 78-digit values fit 288 bits; never reduce modulo a field.
	}
	var bits []frontend.Variable
	for _, l := range limbs {
		bits = append(bits, api.ToBinary(l, 96)...)
	}
	result := decimalValue{Word: [2]frontend.Variable{api.FromBinary(bits[128:256]...), api.FromBinary(bits[:128]...)}, Domain: api.IsZero(api.FromBinary(bits[256:]...))}
	result.Bytes = wordBytes(api, result.Word)
	return result, text
}
func wordInRange(api frontend.API, w [2]frontend.Variable, max int) frontend.Variable {
	return api.And(api.IsZero(w[0]), api.And(api.Sub(1, api.IsZero(w[1])), cmp.IsLessOrEqual(api, w[1], max)))
}
func sameWord(api frontend.API, a, b [2]frontend.Variable) frontend.Variable {
	return api.And(api.IsZero(api.Sub(a[0], b[0])), api.IsZero(api.Sub(a[1], b[1])))
}
func gridPoint(api frontend.API, city, hood, slot, row frontend.Variable) (frontend.Variable, frontend.Variable) {
	api.ToBinary(row, 4)
	api.AssertIsEqual(cmp.IsLessOrEqual(api, row, 14), 1)
	col := api.Sub(slot, 1, api.Mul(row, 17))
	api.ToBinary(col, 5)
	api.AssertIsEqual(cmp.IsLessOrEqual(api, col, 16), 1)
	return api.Add(api.Mul(api.Sub(city, 1), 17), col), api.Add(api.Mul(api.Sub(hood, 1), 15), row)
}

type MessageCircuit struct {
	Context     MissionContext
	Message     CanonicalMessageWitness
	PlainPacked []frontend.Variable `gnark:",public"`
	CryptoValid frontend.Variable   `gnark:",public"`
	Valid       frontend.Variable   `gnark:",public"`
	PlainLength int                 `gnark:"-"`
}

func (c *MessageCircuit) Define(api frontend.API) error {
	if err := c.Context.Define(api); err != nil {
		return err
	}
	api.AssertIsBoolean(c.CryptoValid)
	api.AssertIsBoolean(c.Valid)
	api.ToBinary(c.Message.Kind, 4)
	api.AssertIsEqual(cmp.IsLessOrEqual(api, c.Message.Kind, 9), 1)
	u, err := uints.NewBytes(api)
	if err != nil {
		return err
	}
	text := uints.NewU8Array([]byte("["))
	text = append(text, u.ValueOf(api.Add(c.Message.Kind, 48)))
	var values [4]decimalValue
	for i, d := range c.Message.Digits {
		v, digits := canonicalDecimal(api, d)
		values[i] = v
		text = append(text, uints.NewU8Array([]byte(",\""))...)
		text = append(text, digits...)
		text = append(text, uints.NewU8('"'))
	}
	text = append(text, uints.NewU8(']'))
	plain := unpackPadded(api, c.PlainPacked, c.PlainLength)
	if len(text) != len(plain) {
		api.AssertIsEqual(c.CryptoValid, 0)
	} else {
		for i := range text {
			api.AssertIsEqual(api.Mul(c.CryptoValid, api.Sub(u.Value(text[i]), u.Value(plain[i]))), 0)
		}
	}
	return defineMissionPredicate(api, c.Context, c.Message.Kind, values, c.Message.FromRow, c.Message.TargetRow, c.CryptoValid, c.Valid)
}

// Shared semantic predicate for canonical JSON and the fixed binary future codec.
func defineMissionPredicate(api frontend.API, context MissionContext, kind frontend.Variable, values [4]decimalValue, fromRow, targetRow, cryptoValid, valid frontend.Variable) error {
	u, err := uints.NewBytes(api)
	if err != nil {
		return err
	}
	domain := api.And(cmp.IsLessOrEqual(api, 1, kind), cmp.IsLessOrEqual(api, kind, 4))
	for _, v := range values {
		domain = api.And(domain, v.Domain)
	}
	// Reproduce hiddenCommit's six complete ABI words, preserving all uint256 bits.
	committed := wordBytes(api, context.Words[5])
	kindWord := uints.NewU8Array(make([]byte, 32))
	kindWord[31] = u.ValueOf(kind)
	committed = append(committed, kindWord...)
	for _, v := range values {
		committed = append(committed, v.Bytes...)
	}
	commitmentOK := sameBytes(api, keccakBytes(api, committed), wordBytes(api, context.Words[18]))
	bounds := []int{50, 50, 255}
	var safe [3]frontend.Variable
	var targetOK frontend.Variable = 1
	var sameOrigin frontend.Variable = 1
	for i, bound := range bounds {
		inRange := wordInRange(api, values[i].Word, bound)
		targetOK = api.And(targetOK, inRange)
		safe[i] = api.Select(inRange, values[i].Word[1], 1)
		api.AssertIsEqual(wordInRange(api, context.Words[6+i], bound), 1)
		sameOrigin = api.And(sameOrigin, sameWord(api, values[i].Word, context.Words[6+i]))
	}
	targetOK = api.And(targetOK, api.Sub(1, sameOrigin))
	fx, fy := gridPoint(api, context.Words[6][1], context.Words[7][1], context.Words[8][1], fromRow)
	tx, ty := gridPoint(api, safe[0], safe[1], safe[2], targetRow)
	dx, dy := api.Sub(fx, tx), api.Sub(fy, ty)
	squared := api.Add(api.Mul(dx, dx), api.Mul(dy, dy))
	cover := context.Words[9]
	smallCover := api.And(api.IsZero(cover[0]), cmp.IsLessOrEqual(api, cover[1], 2048))
	clippedCover := api.Select(smallCover, cover[1], 2048)
	// round(sqrt(n)) <= cover iff n <= cover^2+cover for non-negative integer n/cover.
	// Clipping is exact here: every normalized map distance is smaller than 2048.
	coverOK := cmp.IsLessOrEqual(api, squared, api.Add(api.Mul(clippedCover, clippedCover), clippedCover))
	var noCargo frontend.Variable = 1
	for i := 10; i < 14; i++ {
		w := context.Words[i]
		noCargo = api.And(noCargo, api.And(api.IsZero(w[0]), api.IsZero(w[1])))
	}
	cargoOK := api.Or(api.IsZero(api.Sub(kind, 3)), noCargo)
	predicate := api.And(domain, api.And(commitmentOK, api.And(targetOK, api.And(coverOK, cargoOK))))
	api.AssertIsEqual(valid, api.And(cryptoValid, predicate))
	return nil
}

type MissionOpeningCircuit struct {
	Opening AuthenticatedOpeningCircuit
	Context MissionContext
	Message CanonicalMessageWitness
	Valid   frontend.Variable `gnark:",public"`
}

func (c *MissionOpeningCircuit) Define(api frontend.API) error {
	return c.defineWithExternalH3(api, nil)
}

func (c *MissionOpeningCircuit) defineWithExternalH3(api frontend.API, external *externalH3) error {
	if err := c.Opening.defineWithExternalH3(api, external); err != nil {
		return err
	}
	opening := &c.Opening.Opening
	api.AssertIsEqual(c.Context.Words[15][1], opening.Round)
	for i := 0; i < 2; i++ {
		api.AssertIsEqual(c.Context.Words[19][i], opening.CiphertextHashPacked[i])
	}
	cryptoValid := api.And(opening.KEM.CapsuleValid, api.And(opening.Age.HeaderValid, opening.Age.PayloadValid))
	inner := MessageCircuit{Context: c.Context, Message: c.Message, PlainPacked: opening.Age.PlainPacked, CryptoValid: cryptoValid, Valid: c.Valid, PlainLength: opening.Age.PlainLength}
	return inner.Define(api)
}

// The fixed profile is checked against the actual exported rules in the tests.
func checkMissionRulePin(digest string, cities, hoods, slots, cols, rows string) error {
	if digest != "0x"+missionRulesDigest || cities != "50" || hoods != "50" || slots != "255" || cols != "17" || rows != "15" {
		return fmt.Errorf("mission circuit rule profile differs from exported rules")
	}
	return nil
}

package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"io"
	"math/big"
	"strings"

	bls "github.com/consensys/gnark-crypto/ecc/bls12-381"
	"github.com/consensys/gnark/frontend"
	"golang.org/x/crypto/chacha20"
	"golang.org/x/crypto/chacha20poly1305"
	"golang.org/x/crypto/hkdf"
)

// No caller-supplied validity flags, plaintext, file key or expected fixture result.
type producerRequest struct {
	ABI       string `json:"abi"`
	Statement string `json:"statement"`
	Packet    string `json:"packet"`
	Signature string `json:"signature"`
}
type producerWitness struct {
	Assignment frontend.Circuit
	Kind       string
	Valid      bool
	Pre        string
	Plain      []byte
}

func producerDecodeHex(s string) ([]byte, error) {
	return hex.DecodeString(strings.TrimPrefix(s, "0x"))
}
func producerContext(r producerRequest) (missionVector, []byte, []byte, error) {
	var v missionVector
	encoded, e := producerDecodeHex(r.ABI)
	if e != nil || len(encoded) != 640 {
		return v, nil, nil, fmt.Errorf("context must be twenty ABI words")
	}
	root, e := producerDecodeHex(r.Statement)
	if e != nil || len(root) != 32 || !bytes.Equal(root, nativeKeccak(encoded)) {
		return v, nil, nil, fmt.Errorf("statement mismatch")
	}
	packet, e := producerDecodeHex(r.Packet)
	if e != nil || len(packet) != 273 || string(packet[:4]) != "VDH2" || !bytes.Equal(packet[4:36], mustHex(quicknetHash)) {
		return v, nil, nil, fmt.Errorf("invalid packet framing")
	}
	word := func(i int) *big.Int { return new(big.Int).SetBytes(encoded[i*32 : (i+1)*32]) }
	round := binary.BigEndian.Uint64(packet[36:44])
	if round == 0 || round > (1<<53)-1 || word(15).Cmp(new(big.Int).SetUint64(round)) != 0 || word(14).Cmp(new(big.Int).SetUint64(1692803367+(round-1)*3-15)) != 0 {
		return v, nil, nil, fmt.Errorf("round/arrival mismatch")
	}
	if !bytes.Equal(encoded[:32], nativeKeccak([]byte("VENDETTA_OPENING_V2"))) || !bytes.Equal(encoded[128:160], nativeKeccak(nativeKeccak([]byte(missionRulesetLabel)), mustHex(missionRulesDigest))) || !bytes.Equal(encoded[512:544], mustHex(quicknetHash)) || !bytes.Equal(encoded[544:576], nativeKeccak(mustHex(quicknetPublicKey))) || !bytes.Equal(encoded[608:], nativeKeccak(packet)) {
		return v, nil, nil, fmt.Errorf("profile/packet mismatch")
	}
	v.ABI = r.ABI
	v.Statement = r.Statement
	return v, encoded, packet, nil
}
func key32(key, salt []byte, info string) []byte {
	out := make([]byte, 32)
	_, e := io.ReadFull(hkdf.New(sha256.New, key, salt, []byte(info)), out)
	if e != nil {
		panic(e)
	}
	return out
}
func producerHeader(round uint64, capsule []byte) []byte {
	b64 := base64.RawStdEncoding.EncodeToString(capsule)
	lines := []string{}
	for len(b64) > 64 {
		lines = append(lines, b64[:64])
		b64 = b64[64:]
	}
	lines = append(lines, b64)
	return []byte(fmt.Sprintf("age-encryption.org/v1\n-> tlock %016d %s\n%s\n---", round, quicknetHash, strings.Join(lines, "\n")))
}
func producerStatic(encoded, plain []byte) bool {
	if len(plain) != 37 || plain[0] != 2 || plain[1] < 1 || plain[1] > 4 || plain[2] < 1 || plain[2] > 50 || plain[3] < 1 || plain[3] > 50 || plain[4] < 1 || plain[4] > 255 {
		return false
	}
	word := func(i int) *big.Int { return new(big.Int).SetBytes(encoded[i*32 : (i+1)*32]) }
	coords := []uint64{word(6).Uint64(), word(7).Uint64(), word(8).Uint64()}
	if coords[0] == uint64(plain[2]) && coords[1] == uint64(plain[3]) && coords[2] == uint64(plain[4]) {
		return false
	}
	committed := append([]byte(nil), encoded[160:192]...)
	for _, x := range plain[1:5] {
		w := make([]byte, 32)
		w[31] = x
		committed = append(committed, w...)
	}
	committed = append(committed, plain[5:]...)
	if !bytes.Equal(nativeKeccak(committed), encoded[576:608]) {
		return false
	}
	if plain[1] != 3 {
		for i := 10; i < 14; i++ {
			if word(i).Sign() != 0 {
				return false
			}
		}
	}
	grid := func(city, hood, slot uint64) (int64, int64) {
		return int64((city-1)*17 + (slot-1)%17), int64((hood-1)*15 + (slot-1)/17)
	}
	// Origins come from Game storage, but reject unsupported geometry before native arithmetic.
	if coords[0] < 1 || coords[0] > 50 || coords[1] < 1 || coords[1] > 50 || coords[2] < 1 || coords[2] > 255 {
		return false
	}
	x, y := grid(coords[0], coords[1], coords[2])
	a, b := grid(uint64(plain[2]), uint64(plain[3]), uint64(plain[4]))
	dx, dy := x-a, y-b
	n := big.NewInt(dx*dx + dy*dy)
	s := new(big.Int).Sqrt(n)
	square := new(big.Int).Mul(new(big.Int).Set(s), s)
	threshold := new(big.Int).Add(square, s)
	threshold.Add(threshold, big.NewInt(1))
	if n.Cmp(threshold) >= 0 {
		s.Add(s, big.NewInt(1))
	}
	return s.Cmp(word(9)) <= 0
}
func prepareProducer(r producerRequest) (producerWitness, error) {
	var out producerWitness
	v, encoded, packet, e := producerContext(r)
	if e != nil {
		return out, e
	}
	var point bls.G2Affine
	if _, e = point.SetBytes(packet[44:140]); e != nil || point.IsInfinity() || !point.IsInSubGroup() {
		a, e := invalidPointV2Assignment(v, packet, false)
		return producerWitness{Assignment: a, Kind: "invalid-point"}, e
	}
	sigBytes, e := producerDecodeHex(r.Signature)
	if e != nil || len(sigBytes) != 48 {
		return out, fmt.Errorf("authenticated beacon signature required")
	}
	var sig bls.G1Affine
	if _, e = sig.SetBytes(sigBytes); e != nil || sig.IsInfinity() {
		return out, fmt.Errorf("invalid beacon signature")
	}
	round := binary.BigEndian.Uint64(packet[36:44])
	rb := make([]byte, 8)
	binary.BigEndian.PutUint64(rb, round)
	digest := sha256.Sum256(rb)
	hashed, e := bls.HashToG1(digest[:], []byte(quicknetDST))
	if e != nil {
		return out, e
	}
	pk, e := nativeQuicknetKey()
	if e != nil {
		return out, e
	}
	pk.Neg(&pk)
	_, _, _, gen := bls.Generators()
	ok, e := bls.PairingCheck([]bls.G1Affine{sig, hashed}, []bls.G2Affine{gen, pk})
	if e != nil || !ok {
		return out, fmt.Errorf("beacon authentication failed")
	}
	gt, e := bls.Pair([]bls.G1Affine{sig}, []bls.G2Affine{point})
	if e != nil {
		return out, e
	}
	gtBytes := gt.Bytes()
	pad := sha256.Sum256(append([]byte("IBE-H2"), gtBytes[:]...))
	sigma := make([]byte, 16)
	key := make([]byte, 16)
	for i := range sigma {
		sigma[i] = packet[140+i] ^ pad[i]
	}
	pad = sha256.Sum256(append([]byte("IBE-H4"), sigma...))
	for i := range key {
		key[i] = packet[156+i] ^ pad[i]
	}
	pre := sha256.Sum256(append(append([]byte("IBE-H3"), sigma...), key...))
	modulus, _ := new(big.Int).SetString("73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001", 16)
	scalar := new(big.Int)
	for i := 1; i <= 65534; i++ {
		h := sha256.Sum256(append([]byte{byte(i), byte(i >> 8)}, pre[:]...))
		h[0] >>= 1
		n := new(big.Int).SetBytes(h[:])
		if n.Cmp(modulus) < 0 {
			scalar = n
			break
		}
	}
	var calculated bls.G2Affine
	calculated.ScalarMultiplication(&gen, scalar)
	capsuleValid := scalar.Sign() != 0 && calculated.Equal(&point)
	header := producerHeader(round, packet[44:172])
	mac := hmac.New(sha256.New, key32(key, nil, "header"))
	mac.Write(header)
	headerValid := hmac.Equal(mac.Sum(nil), packet[172:204])
	body := packet[204:]
	payloadKey := key32(key, body[:16], "payload")
	nonce := make([]byte, 12)
	nonce[11] = 1
	aead, e := chacha20poly1305.New(payloadKey)
	if e != nil {
		return out, e
	}
	_, authErr := aead.Open(nil, nonce, body[16:], nil)
	cipher, e := chacha20.NewUnauthenticatedCipher(payloadKey, nonce)
	if e != nil {
		return out, e
	}
	cipher.SetCounter(1)
	plain := make([]byte, 37)
	cipher.XORKeyStream(plain, body[16:53])
	cap := capsuleVector{Signature: hex.EncodeToString(sigBytes), Capsule: hex.EncodeToString(packet[44:172]), FileKey: hex.EncodeToString(key), CapsuleValid: capsuleValid}
	kem, e := compactCapsuleAssignment(cap)
	if e != nil {
		return out, e
	}
	age, e := ageAssignment(ageVector{Header: hex.EncodeToString(header), Mac: hex.EncodeToString(packet[172:204]), Body: hex.EncodeToString(body), FileKey: hex.EncodeToString(key), RawPlain: hex.EncodeToString(plain), HeaderValid: headerValid, PayloadValid: authErr == nil})
	if e != nil {
		return out, e
	}
	ctx, e := contextAssignment(v)
	if e != nil {
		return out, e
	}
	opening := CapsuleAgeCircuit{KEM: *kem, Age: *age, Round: round, RoundDecimal: make([]frontend.Variable, 16), CodecV2: true}
	copy(opening.CiphertextHashPacked[:], packBytes(nativeKeccak(packet)))
	for i, c := range fmt.Sprintf("%016d", round) {
		opening.RoundDecimal[i] = int(c - '0')
	}
	valid := capsuleValid && headerValid && authErr == nil && producerStatic(encoded, plain)
	a := &MissionV2Circuit{Opening: AuthenticatedOpeningCircuit{Opening: opening}, Context: ctx, FromRow: new(big.Int).Div(new(big.Int).Sub(new(big.Int).SetBytes(encoded[256:288]), big.NewInt(1)), big.NewInt(17)), TargetRow: 0, Valid: 0}
	if plain[4] > 0 {
		a.TargetRow = int(plain[4]-1) / 17
	}
	if valid {
		a.Valid = 1
	}
	sb := make([]byte, 32)
	scalar.FillBytes(sb)
	copy(a.PrePacked[:], packBytes(pre[:]))
	copy(a.ScalarPacked[:], packBytes(sb))
	return producerWitness{Assignment: a, Kind: "opening", Valid: valid, Pre: "0x" + hex.EncodeToString(pre[:]), Plain: plain}, nil
}

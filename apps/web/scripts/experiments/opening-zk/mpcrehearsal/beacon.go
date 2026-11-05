package mpcrehearsal

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"

	bls "github.com/consensys/gnark-crypto/ecc/bls12-381"
)

const quicknetHash = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971"
const quicknetKey = "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a"
const quicknetDST = "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_"

type Beacon struct {
	ChainHash string `json:"chainHash"`
	Round     uint64 `json:"round"`
	Signature string `json:"signature"`
}

// Archived signatures authenticate the source/round only. They DO NOT prove a
// post-closure unpredictable challenge. This rehearsal cannot approve production.
func authenticateBeacon(b Beacon) ([]byte, error) {
	if b.ChainHash != quicknetHash || b.Round == 0 {
		return nil, errors.New("unsupported rehearsal beacon")
	}
	raw, err := hex.DecodeString(b.Signature)
	if err != nil || len(raw) != 48 || hex.EncodeToString(raw) != b.Signature {
		return nil, errors.New("invalid beacon encoding")
	}
	var sig bls.G1Affine
	if _, err = sig.SetBytes(raw); err != nil || sig.IsInfinity() || !sig.IsInSubGroup() {
		return nil, errors.New("invalid beacon point")
	}
	encoded := sig.Bytes()
	if !bytes.Equal(encoded[:], raw) {
		return nil, errors.New("noncanonical beacon signature")
	}
	keyBytes, _ := hex.DecodeString(quicknetKey)
	var pk bls.G2Affine
	if _, err = pk.SetBytes(keyBytes); err != nil || pk.IsInfinity() || !pk.IsInSubGroup() {
		return nil, errors.New("invalid pinned beacon key")
	}
	var round [8]byte
	binary.BigEndian.PutUint64(round[:], b.Round)
	message := sha256.Sum256(round[:])
	hashed, err := bls.HashToG1(message[:], []byte(quicknetDST))
	if err != nil {
		return nil, err
	}
	pk.Neg(&pk)
	_, _, _, gen := bls.Generators()
	ok, err := bls.PairingCheck([]bls.G1Affine{sig, hashed}, []bls.G2Affine{gen, pk})
	if err != nil || !ok {
		return nil, errors.New("beacon authentication failed")
	}
	// Bind chain, round and signature to the native sealing challenge.
	challenge := sha256.Sum256(append(append(append([]byte("VENDETTA_MPC_REHEARSAL_BEACON_V1\n"), []byte(b.ChainHash)...), round[:]...), raw...))
	return challenge[:], nil
}
func archivedBeacons() []Beacon {
	return []Beacon{
		{quicknetHash, 1000, "b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39"},
		{quicknetHash, 1001, "b33bf3667cbd5a82de3a24b4e0e9fe5513cc1a0e840368c6e31f5fcfa79bea03f73896b25883abf2853d10337fb8fa41"},
	}
}

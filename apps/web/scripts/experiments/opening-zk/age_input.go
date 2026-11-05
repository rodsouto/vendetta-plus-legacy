package main

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"os"

	"github.com/consensys/gnark/frontend"
)

type ageVector struct {
	CiphertextHash string `json:"ciphertextHash"`
	Name           string `json:"name"`
	Header         string `json:"header"`
	Mac            string `json:"mac"`
	Body           string `json:"body"`
	FileKey        string `json:"fileKey"`
	RawPlain       string `json:"rawPlain"`
	HeaderValid    bool   `json:"headerValid"`
	PayloadValid   bool   `json:"payloadValid"`
}

func readAgeVectors(path string) ([]ageVector, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var data struct {
		Vectors []ageVector `json:"vectors"`
	}
	if err = json.Unmarshal(b, &data); err != nil {
		return nil, err
	}
	if len(data.Vectors) != 18 {
		return nil, fmt.Errorf("expected 18 age vectors")
	}
	return data.Vectors, nil
}
func packBytes(b []byte) []frontend.Variable {
	out := make([]frontend.Variable, (len(b)+15)/16)
	for i := range out {
		block := make([]byte, 16)
		copy(block, b[16*i:])
		out[i] = new(big.Int).SetBytes(block)
	}
	return out
}
func ageShape(header, plain int) *AgeCircuit {
	return &AgeCircuit{HeaderLength: header, PlainLength: plain, HeaderPacked: make([]frontend.Variable, (header+15)/16), BodyPacked: make([]frontend.Variable, (plain+47)/16), PlainPacked: make([]frontend.Variable, (plain+15)/16)}
}
func ageAssignment(v ageVector) (*AgeCircuit, error) {
	header, err := hex.DecodeString(v.Header)
	if err != nil {
		return nil, err
	}
	mac, err := hex.DecodeString(v.Mac)
	if err != nil {
		return nil, err
	}
	body, err := hex.DecodeString(v.Body)
	if err != nil {
		return nil, err
	}
	key, err := hex.DecodeString(v.FileKey)
	if err != nil {
		return nil, err
	}
	plain, err := hex.DecodeString(v.RawPlain)
	if err != nil {
		return nil, err
	}
	if len(key) != 16 || len(mac) != 32 || len(body) != len(plain)+32 {
		return nil, fmt.Errorf("bad age vector lengths")
	}
	a := ageShape(len(header), len(plain))
	a.FileKeyPacked = packBytes(key)[0]
	a.HeaderPacked = packBytes(header)
	a.BodyPacked = packBytes(body)
	a.PlainPacked = packBytes(plain)
	copy(a.MacPacked[:], packBytes(mac))
	a.HeaderValid = 0
	a.PayloadValid = 0
	if v.HeaderValid {
		a.HeaderValid = 1
	}
	if v.PayloadValid {
		a.PayloadValid = 1
	}
	return a, nil
}

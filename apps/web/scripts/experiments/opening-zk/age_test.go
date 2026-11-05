package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"math/big"
	"path/filepath"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/constraint"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
	"github.com/consensys/gnark/std/math/uints"
	"golang.org/x/crypto/chacha20"
	"golang.org/x/crypto/chacha20poly1305"
	"golang.org/x/crypto/hkdf"
)

func ageInputPath() string {
	return filepath.Join("..", "..", "..", "..", "..", "docs", "benchmarks", "timelock-opening", "age-input.json")
}
func nativeHKDF(t *testing.T, key, salt []byte, info string) []byte {
	t.Helper()
	out := make([]byte, 32)
	if _, err := io.ReadFull(hkdf.New(sha256.New, key, salt, []byte(info)), out); err != nil {
		t.Fatal(err)
	}
	return out
}
func decodeHex(t *testing.T, s string) []byte {
	t.Helper()
	b, err := hex.DecodeString(s)
	if err != nil {
		t.Fatal(err)
	}
	return b
}
func TestAgeVectorsAgainstNativeGo(t *testing.T) {
	vectors, err := readAgeVectors(ageInputPath())
	if err != nil {
		t.Fatal(err)
	}
	for _, v := range vectors {
		t.Run(v.Name, func(t *testing.T) {
			key, header, mac, body, plain := decodeHex(t, v.FileKey), decodeHex(t, v.Header), decodeHex(t, v.Mac), decodeHex(t, v.Body), decodeHex(t, v.RawPlain)
			hm := hmac.New(sha256.New, nativeHKDF(t, key, nil, "header"))
			hm.Write(header)
			if hmac.Equal(hm.Sum(nil), mac) != v.HeaderValid {
				t.Fatal("header authentication differs")
			}
			payloadKey := nativeHKDF(t, key, body[:16], "payload")
			aead, err := chacha20poly1305.New(payloadKey)
			if err != nil {
				t.Fatal(err)
			}
			nonce := make([]byte, 12)
			nonce[11] = 1
			opened, err := aead.Open(nil, nonce, body[16:], nil)
			if (err == nil) != v.PayloadValid {
				t.Fatal("payload authentication differs")
			}
			if err == nil && !bytes.Equal(opened, plain) {
				t.Fatal("plaintext differs")
			}
			stream, err := chacha20.NewUnauthenticatedCipher(payloadKey, nonce)
			if err != nil {
				t.Fatal(err)
			}
			stream.SetCounter(1)
			raw := make([]byte, len(plain))
			stream.XORKeyStream(raw, body[16:len(body)-16])
			if !bytes.Equal(raw, plain) {
				t.Fatal("raw decrypted bytes differ")
			}
		})
	}
}
func TestAgeCircuit(t *testing.T) {
	vectors, err := readAgeVectors(ageInputPath())
	if err != nil {
		t.Fatal(err)
	}
	cache := map[int]constraint.ConstraintSystem{}
	for _, v := range vectors {
		t.Run(v.Name, func(t *testing.T) {
			a, err := ageAssignment(v)
			if err != nil {
				t.Fatal(err)
			}
			cs := cache[a.PlainLength]
			if cs == nil {
				cs, err = frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, ageShape(a.HeaderLength, a.PlainLength))
				if err != nil {
					t.Fatal(err)
				}
				cache[a.PlainLength] = cs
				t.Logf("plaintext=%d constraints=%d publicInputs=%d", a.PlainLength, cs.GetNbConstraints(), cs.GetNbPublicVariables()-1)
			}
			w, err := frontend.NewWitness(a, ecc.BN254.ScalarField())
			if err != nil {
				t.Fatal(err)
			}
			if err = cs.IsSolved(w); err != nil {
				t.Fatal(err)
			}
			// Neither an honest nor a manipulated ciphertext may have its authentication result flipped.
			for _, which := range []string{"header", "payload"} {
				b, err := ageAssignment(v)
				if err != nil {
					t.Fatal(err)
				}
				if which == "header" {
					if v.HeaderValid {
						b.HeaderValid = 0
					} else {
						b.HeaderValid = 1
					}
				} else {
					if v.PayloadValid {
						b.PayloadValid = 0
					} else {
						b.PayloadValid = 1
					}
				}
				w, err := frontend.NewWitness(b, ecc.BN254.ScalarField())
				if err != nil {
					t.Fatal(err)
				}
				if cs.IsSolved(w) == nil {
					t.Fatalf("forged %s result accepted", which)
				}
			}
		})
	}
	// Canonical padding and bit bounds are part of the relation, not ignored witness data.
	a, err := ageAssignment(vectors[0])
	if err != nil {
		t.Fatal(err)
	}
	cs := cache[a.PlainLength]
	mutations := map[string]func(*AgeCircuit){
		"discarded-plaintext-padding": func(a *AgeCircuit) {
			i := len(a.PlainPacked) - 1
			a.PlainPacked[i] = new(big.Int).Add(a.PlainPacked[i].(*big.Int), big.NewInt(1))
		},
		"file-key-over-128-bits": func(a *AgeCircuit) {
			a.FileKeyPacked = new(big.Int).Add(a.FileKeyPacked.(*big.Int), new(big.Int).Lsh(big.NewInt(1), 128))
		},
		"wrong-plaintext": func(a *AgeCircuit) {
			a.PlainPacked[0] = new(big.Int).Add(a.PlainPacked[0].(*big.Int), new(big.Int).Lsh(big.NewInt(1), 120))
		},
	}
	for name, mutate := range mutations {
		t.Run(name, func(t *testing.T) {
			a, err := ageAssignment(vectors[0])
			if err != nil {
				t.Fatal(err)
			}
			mutate(a)
			w, err := frontend.NewWitness(a, ecc.BN254.ScalarField())
			if err != nil {
				t.Fatal(err)
			}
			if cs.IsSolved(w) == nil {
				t.Fatal("tampered input accepted")
			}
		})
	}
}

type polyVectorCircuit struct {
	Message []uints.U8
	Key     [32]uints.U8
	Tag     [16]uints.U8
}

func (c *polyVectorCircuit) Define(api frontend.API) error {
	api.AssertIsEqual(sameBytes(api, poly1305(api, c.Message, c.Key[:]), c.Tag[:]), 1)
	return nil
}
func TestPoly1305RFC8439(t *testing.T) {
	message := []byte("Cryptographic Forum Research Group")
	key := decodeHex(t, "85d6be7857556d337f4452fe42d506a80103808afb0db2fd4abff6af4149f51b")
	tag := decodeHex(t, "a8061dc1305136c6c22b8baf0c0127a9")
	a := &polyVectorCircuit{Message: uints.NewU8Array(message)}
	copy(a.Key[:], uints.NewU8Array(key))
	copy(a.Tag[:], uints.NewU8Array(tag))
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &polyVectorCircuit{Message: make([]uints.U8, len(message))})
	if err != nil {
		t.Fatal(err)
	}
	w, err := frontend.NewWitness(a, ecc.BN254.ScalarField())
	if err != nil {
		t.Fatal(err)
	}
	if err = cs.IsSolved(w); err != nil {
		t.Fatal(err)
	}
}

package main

import (
	"encoding/hex"
	"fmt"
	"math/big"
	"math/rand/v2"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
	"github.com/consensys/gnark/std/math/uints"
)

// Isolate the exact static predicate called by MissionV2Circuit. Crypto and
// version are held valid here; their failure branches belong to TestMissionV2Circuit.
type missionStaticCircuit struct {
	Context                   MissionContext
	Plain                     [37]uints.U8
	FromRow, TargetRow, Valid frontend.Variable
}

func (c *missionStaticCircuit) Define(api frontend.API) error {
	u, err := uints.NewBytes(api)
	if err != nil {
		return err
	}
	var values [4]decimalValue
	for i := 0; i < 3; i++ {
		b := uints.NewU8Array(make([]byte, 32))
		b[31] = c.Plain[i+2]
		values[i] = decimalValue{Word: [2]frontend.Variable{0, u.Value(c.Plain[i+2])}, Bytes: b, Domain: 1}
	}
	pack := func(b []uints.U8) frontend.Variable {
		var n frontend.Variable = 0
		for _, v := range b {
			n = api.Add(api.Mul(n, 256), u.Value(v))
		}
		return n
	}
	values[3] = decimalValue{Word: [2]frontend.Variable{pack(c.Plain[5:21]), pack(c.Plain[21:])}, Bytes: c.Plain[5:], Domain: 1}
	return defineMissionPredicate(api, c.Context, u.Value(c.Plain[1]), values, c.FromRow, c.TargetRow, 1, c.Valid)
}

func TestMissionStaticMatchesExecution(t *testing.T) {
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &missionStaticCircuit{})
	if err != nil {
		t.Fatal(err)
	}
	type vector struct {
		Name     string `json:"name"`
		ABI      string `json:"abi"`
		RawPlain string `json:"rawPlain"`
		Expected string `json:"expected"`
	}
	var vectors []vector
	rng := rand.New(rand.NewPCG(19, 104031))
	origins := [][3]byte{{1, 1, 1}, {50, 50, 255}, {12, 34, 17}, {3, 49, 18}}
	targets := [][3]byte{{1, 1, 2}, {1, 1, 1}, {50, 50, 255}, {0, 1, 1}, {51, 1, 1}, {1, 0, 1}, {1, 51, 1}, {1, 1, 0}, {12, 34, 16}, {12, 34, 17}, {12, 34, 18}, {12, 34, 255}}
	for i := 0; i < 12; i++ {
		origins = append(origins, [3]byte{byte(rng.IntN(50) + 1), byte(rng.IntN(50) + 1), byte(rng.IntN(255) + 1)})
		targets = append(targets, [3]byte{byte(rng.IntN(50) + 1), byte(rng.IntN(50) + 1), byte(rng.IntN(255) + 1)})
	}
	validCount := 0
	for i, target := range targets {
		from := origins[i%len(origins)]
		if i == 1 {
			from = target
		} // Exact same-origin rejection, not accidental distance failure.
		if i == 2 {
			from = origins[0]
		}
		grid := func(c [3]byte) (int64, int64) {
			return int64(c[0]-1)*17 + int64(c[2]-1)%17, int64(c[1]-1)*15 + int64(c[2]-1)/17
		}
		// For out-of-map targets choose a supported cover, so rejection is about coordinates.
		distance := int64(100)
		if target[0] > 0 && target[1] > 0 && target[2] > 0 {
			x, y := grid(from)
			a, b := grid(target)
			n := big.NewInt((x-a)*(x-a) + (y-b)*(y-b))
			s := new(big.Int).Sqrt(n).Int64()
			if n.Int64() >= s*s+s+1 {
				s++
			}
			distance = s
		}
		for _, kind := range []byte{0, 1, 2, 3, 4, 5, 255} {
			for variant := 0; variant < 4; variant++ {
				encoded := make([]byte, 640)
				put := func(i int, n *big.Int) { n.FillBytes(encoded[i*32 : (i+1)*32]) }
				owner := new(big.Int).SetUint64(^uint64(0) - uint64(i))
				put(5, owner)
				for j, c := range from {
					put(6+j, big.NewInt(int64(c)))
				}
				cover := distance
				if variant == 1 && cover > 1 {
					cover--
				}
				if cover == 0 {
					cover = 1
				}
				put(9, big.NewInt(cover))
				if variant == 2 {
					put(10+i%4, new(big.Int).SetUint64(^uint64(0)))
				}
				plain := make([]byte, 37)
				copy(plain, []byte{2, kind, target[0], target[1], target[2]})
				for j := 5; j < len(plain); j++ {
					plain[j] = byte(rng.Uint32())
				}
				if i == 0 {
					for j := 5; j < len(plain); j++ {
						plain[j] = 255
					}
				}
				commit := append([]byte(nil), encoded[160:192]...)
				for _, b := range plain[1:5] {
					commit = append(commit, new(big.Int).SetUint64(uint64(b)).FillBytes(make([]byte, 32))...)
				}
				commit = append(commit, plain[5:]...)
				copy(encoded[576:608], nativeKeccak(commit))
				if variant == 3 {
					encoded[607] ^= 1
				}
				valid := producerStatic(encoded, plain)
				a := &missionStaticCircuit{FromRow: int(from[2]-1) / 17, TargetRow: 0}
				copy(a.Plain[:], uints.NewU8Array(plain))
				for j := 0; j < 20; j++ {
					copy(a.Context.Words[j][:], packBytes(encoded[j*32:(j+1)*32]))
				}
				a.Context.StatementPacked = [2]frontend.Variable{0, 0}
				if target[2] > 0 {
					a.TargetRow = int(target[2]-1) / 17
				}
				for claim := 0; claim <= 1; claim++ {
					a.Valid = claim
					w, e := frontend.NewWitness(a, ecc.BN254.ScalarField())
					if e != nil {
						t.Fatal(e)
					}
					e = cs.IsSolved(w)
					if (e == nil) != ((claim == 1) == valid) {
						t.Fatalf("case=%d kind=%d variant=%d claim=%d valid=%v: %v", i, kind, variant, claim, valid, e)
					}
				}
				expected := "invalid"
				if valid {
					expected = "valid"
					validCount++
				}
				vectors = append(vectors, vector{fmt.Sprintf("%d/%d/%d", i, kind, variant), "0x" + hex.EncodeToString(encoded), hex.EncodeToString(plain), expected})
			}
		}
	}
	if validCount == 0 || validCount == len(vectors) {
		t.Fatal("degenerate differential corpus")
	}
	root, err := filepath.Abs(filepath.Join("..", "..", "..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	file, err := os.CreateTemp(filepath.Join(root, "contracts", "test", "fixtures", "hidden"), "static-*.json")
	if err != nil {
		t.Fatal(err)
	}
	path := file.Name()
	t.Cleanup(func() { os.Remove(path) })
	if _, err = file.Write(mustJSON(t, map[string]any{"vectors": vectors, "count": len(vectors)})); err != nil {
		t.Fatal(err)
	}
	if err = file.Close(); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("forge", "test", "--root", filepath.Join(root, "contracts"), "--match-test", "testCircuitPredicateCorpus", "-vv")
	cmd.Env = append(os.Environ(), "HIDDEN_STATIC_CORPUS="+path)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("Solidity differential: %v\n%s", err, output)
	}
	t.Logf("%d static cases (%d valid, %d invalid), both circuit claims, then actual Missions.advance:\n%s", len(vectors), validCount, len(vectors)-validCount, output)
}

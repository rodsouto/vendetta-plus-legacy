package main

import (
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	bncs "github.com/consensys/gnark/constraint/bn254"
	"math/big"
	"os"
	"path/filepath"
	"runtime"
	"syscall"
	"time"

	"github.com/consensys/gnark-crypto/ecc"
	fr "github.com/consensys/gnark-crypto/ecc/bn254/fr"
	"github.com/consensys/gnark/backend"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/backend/solidity"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

func runInvalidPointV2(inputPath, outputDir string) {
	data, err := os.ReadFile(inputPath)
	check(err)
	var input struct{ Vectors []json.RawMessage }
	check(json.Unmarshal(data, &input))
	if len(input.Vectors) != 9 {
		panic("expected nine mission v2 fixtures")
	}
	var base missionVector
	var extra struct{ Packet string }
	check(json.Unmarshal(input.Vectors[0], &base))
	check(json.Unmarshal(input.Vectors[0], &extra))
	original, err := hex.DecodeString(extra.Packet)
	check(err)
	bad := append([]byte(nil), original...)
	bad[44] &= 127
	pointData, err := os.ReadFile(filepath.Join(filepath.Dir(inputPath), "..", "invalid-point", "vectors.json"))
	check(err)
	var points struct {
		Vectors []struct {
			Name    string
			Encoded string
		}
	}
	check(json.Unmarshal(pointData, &points))
	torsion := append([]byte(nil), original...)
	found := false
	for _, p := range points.Vectors {
		if p.Name == "order-13-torsion" {
			encoded, e := hex.DecodeString(p.Encoded)
			check(e)
			copy(torsion[44:140], encoded)
			found = true
		}
	}
	if !found {
		panic("missing torsion fixture")
	}
	vectors := []struct {
		Name   string
		Packet []byte
	}{{"invalid-compression-flag", bad}, {"order-13-torsion", torsion}}
	check(os.MkdirAll(outputDir, 0755))
	stats := map[string]any{"componentOnly": true, "scope": "Exact admitted v2 packet has unusable compressed G2 U; original immutable statement required; no beacon/H3 or Game effects", "go": runtime.Version(), "gnark": "v0.16.4", "gomaxprocs": runtime.GOMAXPROCS(0), "externalH3": false}
	write := func(name string, v any) {
		b, err := json.MarshalIndent(v, "", "  ")
		check(err)
		check(os.WriteFile(filepath.Join(outputDir, name), append(b, '\n'), 0644))
	}
	measure := func(name string, fn func()) {
		fmt.Println("stage:", name)
		start := time.Now()
		fn()
		stats[name+"Ms"] = float64(time.Since(start).Microseconds()) / 1000
		write("metrics.json", stats)
	}
	start := time.Now()
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &InvalidPointMissionV2Circuit{})
	check(err)
	stats["compileMs"] = float64(time.Since(start).Microseconds()) / 1000
	stats["constraints"] = cs.GetNbConstraints()
	stats["publicInputs"] = cs.GetNbPublicVariables() - 1
	fmt.Println("constraints:", cs.GetNbConstraints())
	stats["referenceVectors"] = len(vectors)
	originalA, err := invalidPointV2Assignment(base, original, false)
	check(err)
	originalW, err := frontend.NewWitness(originalA, ecc.BN254.ScalarField())
	check(err)

	var pk groth16.ProvingKey
	var vk groth16.VerifyingKey
	measure("setup", func() { pk, vk, err = groth16.Setup(cs); check(err) })
	measure("rejectOriginalValidPacket", func() {
		_, rejectErr := groth16.Prove(cs, pk, originalW, solidity.WithProverTargetSolidityVerifier(backend.GROTH16))
		var unsatisfied *bncs.UnsatisfiedConstraintError
		if !errors.As(rejectErr, &unsatisfied) {
			panic(fmt.Sprintf("expected actual unsatisfied constraint for original valid packet, got %v", rejectErr))
		}
		stats["originalValidPacketRejected"] = true
	})

	receipts := []map[string]any{}
	for i := 0; i < 2; i++ {
		v := vectors[i]
		a, err := invalidPointV2Assignment(base, v.Packet, true)
		check(err)
		full, err := frontend.NewWitness(a, ecc.BN254.ScalarField())
		check(err)
		pub, err := full.Public()
		check(err)
		var proof groth16.Proof
		measure(fmt.Sprintf("prove%d", i), func() {
			proof, err = groth16.Prove(cs, pk, full, solidity.WithProverTargetSolidityVerifier(backend.GROTH16))
			check(err)
		})
		measure(fmt.Sprintf("verify%d", i), func() {
			check(groth16.Verify(proof, vk, pub, solidity.WithVerifierTargetSolidityVerifier(backend.GROTH16)))
		})
		originalA, err := invalidPointV2Assignment(base, original, false)
		check(err)
		a.Context.StatementPacked = originalA.Context.StatementPacked
		forged, err := frontend.NewWitness(a, ecc.BN254.ScalarField(), frontend.PublicOnly())
		check(err)
		if groth16.Verify(proof, vk, forged, solidity.WithVerifierTargetSolidityVerifier(backend.GROTH16)) == nil {
			panic("certificate accepted for original valid mission")
		}
		vals := pub.Vector().(fr.Vector)
		strings := make([]string, len(vals))
		for j := range vals {
			strings[j] = vals[j].String()
		}
		encoded := proof.(interface{ MarshalSolidity() []byte }).MarshalSolidity()
		name := "proof.json"
		if i == 1 {
			name = "torsion-proof.json"
		}
		root := make([]byte, 32)
		for j := 0; j < 2; j++ {
			n, ok := new(big.Int).SetString(strings[j], 10)
			if !ok {
				panic("bad public digest")
			}
			n.FillBytes(root[16*j : 16*(j+1)])
		}
		write(name, map[string]any{"proof": "0x" + hex.EncodeToString(encoded), "publicInputs": strings, "statement": "0x" + hex.EncodeToString(root), "packet": "0x" + hex.EncodeToString(v.Packet), "originalValidStatement": base.Statement})
		receipts = append(receipts, map[string]any{"name": v.Name, "proofSolidityBytes": len(encoded), "forgedResultRejected": true, "artifact": name})
	}
	verifier, err := os.Create(filepath.Join(outputDir, "PairingVerifier.sol"))
	check(err)
	check(vk.ExportSolidity(verifier))
	check(verifier.Close())
	var usage syscall.Rusage
	check(syscall.Getrusage(syscall.RUSAGE_SELF, &usage))
	stats["maxRssKiB"] = usage.Maxrss
	stats["receipts"] = receipts
	stats["nodeVectorsProven"] = len(receipts)
	write("metrics.json", stats)
	fmt.Println("invalid point v2 proofs and verifier written")
}

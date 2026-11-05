package main

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
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

func runCapsule(inputPath, outputDir string) {
	vectors, err := readCapsuleVectors(inputPath)
	check(err)
	check(os.MkdirAll(outputDir, 0755))
	stats := map[string]any{"componentOnly": true, "scope": "pairing + compressed-byte binding + bounded tlock KEM; not authenticated beacon, age or mission", "go": runtime.Version(), "gnark": "v0.16.4", "gomaxprocs": runtime.GOMAXPROCS(0), "h3Candidates": 4}
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
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &CapsuleCircuit{})
	check(err)
	stats["compileMs"] = float64(time.Since(start).Microseconds()) / 1000
	stats["constraints"] = cs.GetNbConstraints()
	stats["publicInputs"] = cs.GetNbPublicVariables() - 1
	fmt.Println("constraints:", cs.GetNbConstraints())
	stats["referenceVectors"] = len(vectors)
	var pk groth16.ProvingKey
	var vk groth16.VerifyingKey
	measure("setup", func() { pk, vk, err = groth16.Setup(cs); check(err) })
	receipts := []map[string]any{}
	for i := 0; i < 2; i++ {
		v := vectors[i]
		a, err := capsuleAssignment(v)
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
		if v.CapsuleValid {
			a.CapsuleValid = 0
		} else {
			a.CapsuleValid = 1
		}
		forged, err := frontend.NewWitness(a, ecc.BN254.ScalarField(), frontend.PublicOnly())
		check(err)
		if groth16.Verify(proof, vk, forged, solidity.WithVerifierTargetSolidityVerifier(backend.GROTH16)) == nil {
			panic("forged capsule result accepted")
		}
		vals := pub.Vector().(fr.Vector)
		strings := make([]string, len(vals))
		for j := range vals {
			strings[j] = vals[j].String()
		}
		encoded := proof.(interface{ MarshalSolidity() []byte }).MarshalSolidity()
		name := "proof.json"
		if i == 1 {
			name = "invalid-proof.json"
		}
		write(name, map[string]any{"proof": "0x" + hex.EncodeToString(encoded), "publicInputs": strings})
		receipts = append(receipts, map[string]any{"name": v.Name, "capsuleValid": v.CapsuleValid, "proofSolidityBytes": len(encoded), "forgedResultRejected": true, "artifact": name})
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
	fmt.Println("capsule proofs and verifier written")
}

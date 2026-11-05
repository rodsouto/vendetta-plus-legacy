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

func runMissionV2(inputPath, outputDir string) {
	data, err := os.ReadFile(inputPath)
	check(err)
	var input struct{ Vectors []json.RawMessage }
	check(json.Unmarshal(data, &input))
	if len(input.Vectors) != 9 {
		panic("expected nine mission v2 fixtures")
	}
	vectors := input.Vectors
	check(os.MkdirAll(outputDir, 0755))
	stats := map[string]any{"componentOnly": false, "scope": "Full fixed v2 mission relation with authenticated beacon; consumer MUST enforce exact H3 prefix, statement and version; no Game integration", "go": runtime.Version(), "gnark": "v0.16.4", "gomaxprocs": runtime.GOMAXPROCS(0), "externalH3": true}
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
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &MissionV2Circuit{Opening: AuthenticatedOpeningCircuit{Opening: CapsuleAgeCircuit{Age: *ageShape(290, 37), RoundDecimal: make([]frontend.Variable, 16), CodecV2: true}}})
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
		index := []int{1, 5}[i]
		v := vectors[index]
		a, valid, err := missionV2Assignment(v)
		check(err)
		var meta struct{ Name string }
		check(json.Unmarshal(v, &meta))
		if !valid {
			a.Valid = 0
		}
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
		if valid {
			a.Valid = 0
		} else {
			a.Valid = 1
		}
		forged, err := frontend.NewWitness(a, ecc.BN254.ScalarField(), frontend.PublicOnly())
		check(err)
		if groth16.Verify(proof, vk, forged, solidity.WithVerifierTargetSolidityVerifier(backend.GROTH16)) == nil {
			panic("forged mission result accepted")
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
		receipts = append(receipts, map[string]any{"name": meta.Name, "missionValid": valid, "proofSolidityBytes": len(encoded), "forgedResultRejected": true, "artifact": name})
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
	fmt.Println("mission v2 proofs and verifier written")
}

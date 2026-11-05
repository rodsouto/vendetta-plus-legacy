// Measures a real Groth16 proof of the variable BLS12-381 pairing used by tlock.
// This circuit is a component, NOT the complete opening/invalidation predicate.
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
	bls "github.com/consensys/gnark-crypto/ecc/bls12-381"
	fr "github.com/consensys/gnark-crypto/ecc/bn254/fr"
	"github.com/consensys/gnark/backend"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/backend/solidity"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
	curve "github.com/consensys/gnark/std/algebra/emulated/sw_bls12381"
	"github.com/consensys/gnark/std/math/emulated"
)

type PairCircuit struct {
	Signature curve.G1Affine `gnark:",public"`
	U         curve.G2Affine `gnark:",public"`
	GT        curve.GTEl     `gnark:",public"`
}

func (c *PairCircuit) Define(api frontend.API) error {
	p, err := curve.NewPairing(api)
	if err != nil {
		return err
	}
	p.AssertIsOnG1(&c.Signature)
	p.AssertIsOnG2(&c.U)
	f, err := emulated.NewField[curve.BaseField](api)
	if err != nil {
		return err
	}
	api.AssertIsEqual(api.Mul(f.IsZero(&c.Signature.X), f.IsZero(&c.Signature.Y)), 0)
	zeroX := api.Mul(f.IsZero(&c.U.P.X.A0), f.IsZero(&c.U.P.X.A1))
	zeroY := api.Mul(f.IsZero(&c.U.P.Y.A0), f.IsZero(&c.U.P.Y.A1))
	api.AssertIsEqual(api.Mul(zeroX, zeroY), 0)
	gt, err := p.Pair([]*curve.G1Affine{&c.Signature}, []*curve.G2Affine{&c.U})
	if err != nil {
		return err
	}
	p.AssertIsEqual(gt, &c.GT)
	return nil
}

func check(err error) {
	if err != nil {
		panic(err)
	}
}

func main() {
	if len(os.Args) == 4 && os.Args[1] == "--compile-cs-v2" {
		compileProducerCS(os.Args[2], os.Args[3])
		return
	}
	if len(os.Args) == 4 && os.Args[1] == "--inspect-v2" {
		inspectProducer(os.Args[2], os.Args[3])
		return
	}
	if len(os.Args) == 4 && os.Args[1] == "--unsafe-local-setup-v2" {
		producerSetup(os.Args[2], os.Args[3])
		return
	}
	if len(os.Args) == 3 && os.Args[1] == "--prove-worker-v2" {
		producerWorker(os.Args[2], os.Stdin, os.Stdout)
		return
	}
	if len(os.Args) == 5 && os.Args[1] == "--prove-v2" {
		producerProve(os.Args[2], os.Args[3], os.Args[4])
		return
	}

	if len(os.Args) == 4 && os.Args[1] == "--invalid-point-v2" {
		runInvalidPointV2(os.Args[2], os.Args[3])
		return
	}
	if len(os.Args) == 4 && os.Args[1] == "--mission-v2" {
		runMissionV2(os.Args[2], os.Args[3])
		return
	}
	if len(os.Args) == 4 && os.Args[1] == "--paginated-capsule" {
		runPaginatedCapsule(os.Args[2], os.Args[3])
		return
	}
	if len(os.Args) == 4 && os.Args[1] == "--capsule" {
		runCapsule(os.Args[2], os.Args[3])
		return
	}
	if len(os.Args) != 3 {
		panic("usage: opening-pairing input.json output-directory")
	}
	var input struct {
		Signature string   `json:"signature"`
		U         string   `json:"u"`
		GT        []string `json:"gt"`
	}
	data, err := os.ReadFile(os.Args[1])
	check(err)
	check(json.Unmarshal(data, &input))
	check(os.MkdirAll(os.Args[2], 0755))
	sigBytes, err := hex.DecodeString(input.Signature)
	check(err)
	uBytes, err := hex.DecodeString(input.U)
	check(err)
	var sig bls.G1Affine
	_, err = sig.SetBytes(sigBytes)
	check(err)
	var u bls.G2Affine
	_, err = u.SetBytes(uBytes)
	check(err)
	gt, err := bls.Pair([]bls.G1Affine{sig}, []bls.G2Affine{u})
	check(err)
	native := []string{gt.C0.B0.A0.String(), gt.C0.B0.A1.String(), gt.C0.B1.A0.String(), gt.C0.B1.A1.String(), gt.C0.B2.A0.String(), gt.C0.B2.A1.String(), gt.C1.B0.A0.String(), gt.C1.B0.A1.String(), gt.C1.B1.A0.String(), gt.C1.B1.A1.String(), gt.C1.B2.A0.String(), gt.C1.B2.A1.String()}
	if len(native) != len(input.GT) {
		panic("GT encoding mismatch")
	}
	for i := range native {
		if native[i] != input.GT[i] {
			panic(fmt.Sprintf("Node/Go pairing mismatch at limb %d", i))
		}
	}
	stats := map[string]any{"componentOnly": true, "nodeGoPairingMatch": true, "go": runtime.Version(), "gnark": "v0.16.4", "gomaxprocs": runtime.GOMAXPROCS(0)}
	measure := func(name string, fn func()) {
		fmt.Println("stage:", name)
		t := time.Now()
		fn()
		stats[name+"Ms"] = float64(time.Since(t).Microseconds()) / 1000
	}
	compileStart := time.Now()
	compiled, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &PairCircuit{})
	check(err)
	stats["compileMs"] = float64(time.Since(compileStart).Microseconds()) / 1000
	stats["constraints"] = compiled.GetNbConstraints()
	stats["publicInputs"] = compiled.GetNbPublicVariables() - 1
	fmt.Println("compiled constraints:", compiled.GetNbConstraints())
	assignment := PairCircuit{Signature: curve.NewG1Affine(sig), U: curve.NewG2Affine(u), GT: curve.NewGTEl(gt)}
	full, err := frontend.NewWitness(&assignment, ecc.BN254.ScalarField())
	check(err)
	public, err := full.Public()
	check(err)
	var pk groth16.ProvingKey
	var vk groth16.VerifyingKey
	measure("setup", func() { pk, vk, err = groth16.Setup(compiled); check(err) })
	var proof groth16.Proof
	measure("prove", func() {
		proof, err = groth16.Prove(compiled, pk, full, solidity.WithProverTargetSolidityVerifier(backend.GROTH16))
		check(err)
	})
	measure("verify", func() {
		check(groth16.Verify(proof, vk, public, solidity.WithVerifierTargetSolidityVerifier(backend.GROTH16)))
	})
	badGT := gt
	badGT.C0.B0.A0.SetOne()
	bad := PairCircuit{Signature: curve.NewG1Affine(sig), U: curve.NewG2Affine(u), GT: curve.NewGTEl(badGT)}
	badPublic, err := frontend.NewWitness(&bad, ecc.BN254.ScalarField(), frontend.PublicOnly())
	check(err)
	if groth16.Verify(proof, vk, badPublic, solidity.WithVerifierTargetSolidityVerifier(backend.GROTH16)) == nil {
		panic("tampered GT accepted")
	}
	stats["tamperedPublicInputRejected"] = true
	vector := public.Vector().(fr.Vector)
	publicStrings := make([]string, len(vector))
	for i := range vector {
		publicStrings[i] = vector[i].String()
	}
	encoded := proof.(interface{ MarshalSolidity() []byte }).MarshalSolidity()
	stats["proofSolidityBytes"] = len(encoded)
	verifier, err := os.Create(filepath.Join(os.Args[2], "PairingVerifier.sol"))
	check(err)
	check(vk.ExportSolidity(verifier))
	check(verifier.Close())
	artifact := map[string]any{"proof": "0x" + hex.EncodeToString(encoded), "publicInputs": publicStrings}
	write := func(name string, v any) {
		bytes, err := json.MarshalIndent(v, "", "  ")
		check(err)
		check(os.WriteFile(filepath.Join(os.Args[2], name), append(bytes, '\n'), 0644))
	}
	var usage syscall.Rusage
	check(syscall.Getrusage(syscall.RUSAGE_SELF, &usage))
	stats["maxRssKiB"] = usage.Maxrss
	write("proof.json", artifact)
	write("metrics.json", stats)
	fmt.Println("proof and verifier written")
}

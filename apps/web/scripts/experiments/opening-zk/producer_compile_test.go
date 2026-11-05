package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	"github.com/consensys/gnark/constraint"
	bncs "github.com/consensys/gnark/constraint/bn254"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

type compileReportCircuit struct {
	X frontend.Variable
	Y frontend.Variable `gnark:",public"`
}

func (c *compileReportCircuit) Define(api frontend.API) error {
	api.AssertIsEqual(api.Mul(c.X, c.X), c.Y)
	return nil
}

func TestCompileCSReport(t *testing.T) {
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &compileReportCircuit{})
	if err != nil {
		t.Fatal(err)
	}
	report, err := describeProducerCS(cs)
	if err != nil {
		t.Fatal(err)
	}
	var serialized bytes.Buffer
	if _, err := cs.WriteTo(&serialized); err != nil {
		t.Fatal(err)
	}
	if report["sha256"] != fmt.Sprintf("%x", sha256.Sum256(serialized.Bytes())) || report["bytes"] != int64(serialized.Len()) {
		t.Fatal("report does not describe native serialized CS")
	}
	decoded := groth16.NewCS(ecc.BN254)
	if _, err := decoded.ReadFrom(bytes.NewReader(serialized.Bytes())); err != nil {
		t.Fatal(err)
	}
	if report["constraints"] != decoded.GetNbConstraints() || report["publicInputs"] != 1 || report["secretVariables"] != 1 {
		t.Fatal("incorrect shape metadata")
	}
}

func TestCompileCSRefusesOverwrite(t *testing.T) {
	output := filepath.Join(t.TempDir(), "report.json")
	if err := os.WriteFile(output, []byte("preserve"), 0600); err != nil {
		t.Fatal(err)
	}
	func() {
		defer func() {
			if recover() == nil {
				t.Fatal("expected refusal before compilation")
			}
		}()
		compileProducerCS("invalid-point", output)
	}()
	b, err := os.ReadFile(output)
	if err != nil || string(b) != "preserve" {
		t.Fatal("existing evidence changed")
	}
}

func TestCompileCSCommitmentDimensions(t *testing.T) {
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &setupMPCTestCircuit{})
	if err != nil {
		t.Fatal(err)
	}
	report, err := describeProducerCS(cs)
	if err != nil {
		t.Fatal(err)
	}
	actual := cs.GetCommitments().(constraint.Groth16Commitments)
	dimensions := report["commitments"].([]map[string]int)
	if len(actual) == 0 || len(dimensions) != len(actual) {
		t.Fatal("missing commitment dimensions")
	}
	for i, c := range actual {
		if dimensions[i]["privateCommitted"] != len(c.PrivateCommitted) ||
			dimensions[i]["publicAndCommitmentCommitted"] != len(c.PublicAndCommitmentCommitted) ||
			dimensions[i]["publicCommitted"] != c.NbPublicCommitted ||
			dimensions[i]["commitmentIndex"] != c.CommitmentIndex {
			t.Fatal("commitment dimensions differ from native CS")
		}
	}
}

func TestCompileCSPhase2AllocationModel(t *testing.T) {
	for name, shape := range map[string]frontend.Circuit{
		"plain": &compileReportCircuit{}, "commitment": &setupMPCTestCircuit{},
	} {
		t.Run(name, func(t *testing.T) {
			compiled, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, shape)
			if err != nil {
				t.Fatal(err)
			}
			report, err := describeProducerCS(compiled)
			if err != nil {
				t.Fatal(err)
			}
			input, err := json.Marshal(report)
			if err != nil {
				t.Fatal(err)
			}
			command := exec.Command("python3", "-c",
				"import json,runpy,sys; print(json.dumps(runpy.run_path(sys.argv[1])['model'](json.load(sys.stdin))))",
				"../../../../../scripts/hidden-v2-phase2-model.py")
			command.Stdin = bytes.NewReader(input)
			output, err := command.CombinedOutput()
			if err != nil {
				t.Fatalf("phase2 model: %v %s", err, output)
			}
			var model struct {
				PKK    int `json:"pkkPoints"`
				VKK    int `json:"vkkPoints"`
				Pieces map[string]struct {
					G1 int `json:"g1Points"`
					G2 int `json:"g2Points"`
				} `json:"pieces"`
			}
			if err := json.Unmarshal(output, &model); err != nil {
				t.Fatal(err)
			}
			n := ecc.NextPowerOfTwo(uint64(compiled.GetNbConstraints()))
			// Tiny, in-memory, fixed-beacon test only. No game setup or persisted keys.
			commons := mpcsetup.NewPhase1(n).Seal([]byte("allocation-model-test-only"))
			phase2 := new(mpcsetup.Phase2)
			evals := phase2.Initialize(compiled.(*bncs.R1CS), &commons)
			if model.PKK != len(phase2.Parameters.G1.PKK) || model.VKK != len(evals.G1.VKK) {
				t.Fatal("predicted phase2 private/public dimensions differ from backend")
			}
			parametersG1 := cap(phase2.Parameters.G1.Z) + cap(phase2.Parameters.G1.PKK) + 1
			evaluationG1 := cap(evals.G1.VKK)
			for i := range evals.G1.CKK {
				parametersG1 += len(phase2.Parameters.G1.SigmaCKK[i])
				evaluationG1 += cap(evals.G1.CKK[i])
			}
			parameters := model.Pieces["phase2ParametersAllocatedCapacity"]
			if parameters.G1 != parametersG1 || parameters.G2 != len(phase2.Parameters.G2.Sigma)+1 {
				t.Fatal("predicted phase2 point payload differs from native arrays")
			}
			if model.Pieces["evaluationCommitmentAndPublicBases"].G1 != evaluationG1 {
				t.Fatal("predicted evaluation bases differ from native arrays")
			}
			srs := model.Pieces["commons"]
			if srs.G1 != len(commons.G1.Tau)+len(commons.G1.AlphaTau)+len(commons.G1.BetaTau) || srs.G2 != len(commons.G2.Tau)+1 {
				t.Fatal("predicted commons payload differs from native arrays")
			}
		})
	}
}

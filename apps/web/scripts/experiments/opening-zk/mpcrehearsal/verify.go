package mpcrehearsal

import (
	"bytes"
	"errors"
	"path/filepath"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	"github.com/consensys/gnark/backend/solidity"
	"github.com/consensys/gnark/frontend"
	"vendetta-opening-pairing-experiment/ceremony"
)

type Verification struct {
	Status                         string `json:"status"`
	ConfigSHA256                   string `json:"configSha256"`
	CircuitSHA256                  string `json:"circuitSha256"`
	Constraints                    int    `json:"constraints"`
	DomainSize                     uint64 `json:"domainSize"`
	Phase1ClosureSHA256            string `json:"phase1ClosureSha256"`
	Phase2ClosureSHA256            string `json:"phase2ClosureSha256"`
	ProvingKeySHA256               string `json:"provingKeySha256"`
	VerifyingKeySHA256             string `json:"verifyingKeySha256"`
	SoliditySHA256                 string `json:"soliditySha256"`
	NativeTranscriptVerified       bool   `json:"nativeTranscriptVerified"`
	GuardedNativeDecoding          bool   `json:"guardedNativeDecoding"`
	ContributionSignaturesVerified bool   `json:"contributionSignaturesVerified"`
	BeaconSignaturesAuthenticated  bool   `json:"beaconSignaturesAuthenticated"`
	ProofVerified                  bool   `json:"proofVerified"`
	WrongPublicInputRejected       bool   `json:"wrongPublicInputRejected"`
	ExtractionReproduced           bool   `json:"extractionReproduced"`
	ProductionApproved             bool   `json:"productionApproved"`
	IndependentParticipants        bool   `json:"independentParticipants"`
	BeaconAfterClosureProven       bool   `json:"beaconAfterClosureProven"`
}

func (c *context) extract(phase2Pin string) (groth16.ProvingKey, groth16.VerifyingKey, error) {
	list, hashes, commons, err := c.phase2(2)
	if err != nil {
		return nil, nil, err
	}
	if err := c.checkClosure(2, phase2Pin, hashes); err != nil {
		return nil, nil, err
	}
	return mpcsetup.VerifyPhase2(c.ccs, &commons, c.beacon[1], list...)
}
func Verify(dir, pin, parent, phase2Pin string) (Verification, error) {
	var report Verification
	c, err := load(dir, pin, parent)
	if err != nil {
		return report, err
	}
	pk, vk, err := c.extract(phase2Pin)
	if err != nil {
		return report, err
	}
	pkBytes, err := encodeNative(pk)
	if err != nil {
		return report, err
	}
	vkBytes, err := encodeNative(vk)
	if err != nil {
		return report, err
	}
	// Rebuild every native object from its original bytes. Native sealing mutates
	// the last contribution and must never be applied twice to the same object.
	other, err := load(dir, pin, parent)
	if err != nil {
		return report, err
	}
	pk2, vk2, err := other.extract(phase2Pin)
	if err != nil {
		return report, err
	}
	p2, err := encodeNative(pk2)
	if err != nil {
		return report, err
	}
	v2, err := encodeNative(vk2)
	if err != nil {
		return report, err
	}
	if !bytes.Equal(pkBytes, p2) || !bytes.Equal(vkBytes, v2) {
		return report, errors.New("key extraction is not reproducible")
	}
	var exported bytes.Buffer
	if err := vk.ExportSolidity(&exported); err != nil {
		return report, err
	}
	witness, err := frontend.NewWitness(&toyCircuit{X: 3, Y: 81}, ecc.BN254.ScalarField())
	if err != nil {
		return report, err
	}
	proof, err := groth16.Prove(c.ccs, pk, witness, solidity.WithProverTargetSolidityVerifier(backend.GROTH16))
	if err != nil {
		return report, err
	}
	public, err := witness.Public()
	if err != nil {
		return report, err
	}
	if err := groth16.Verify(proof, vk, public, solidity.WithVerifierTargetSolidityVerifier(backend.GROTH16)); err != nil {
		return report, err
	}
	wrong, err := frontend.NewWitness(&toyCircuit{Y: 80}, ecc.BN254.ScalarField(), frontend.PublicOnly())
	if err != nil {
		return report, err
	}
	if err := groth16.Verify(proof, vk, wrong, solidity.WithVerifierTargetSolidityVerifier(backend.GROTH16)); err == nil {
		return report, errors.New("substituted public input accepted")
	}
	report = Verification{Status: "unsafe-small-mpc-rehearsal-verified", ConfigSHA256: pin, CircuitSHA256: c.config.CircuitSHA256, Constraints: c.ccs.GetNbConstraints(), DomainSize: c.n,
		Phase1ClosureSHA256: parent, Phase2ClosureSHA256: phase2Pin, ProvingKeySHA256: ceremony.Digest(pkBytes), VerifyingKeySHA256: ceremony.Digest(vkBytes), SoliditySHA256: ceremony.Digest(exported.Bytes()),
		NativeTranscriptVerified: true, GuardedNativeDecoding: true, ContributionSignaturesVerified: true, BeaconSignaturesAuthenticated: true, ProofVerified: true, WrongPublicInputRejected: true, ExtractionReproduced: true}
	raw, err := marshal(report)
	if err != nil {
		return report, err
	}
	if err := writeFile(filepath.Join(dir, "verification.json"), raw); err != nil {
		return report, err
	}
	return report, nil
}

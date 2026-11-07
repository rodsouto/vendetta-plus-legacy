package artifactcheck

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	native "github.com/consensys/gnark/backend/groth16/bn254"
	"github.com/consensys/gnark/constraint"
	cs "github.com/consensys/gnark/constraint/bn254"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

type pkCircuit struct {
	X       frontend.Variable
	Y       frontend.Variable `gnark:",public"`
	Commits int               `gnark:"-"`
}

func (c *pkCircuit) Define(api frontend.API) error {
	v := c.X
	for range 4 {
		v = api.Mul(v, c.X)
	}
	api.AssertIsEqual(v, c.Y)
	if c.Commits == 1 {
		commitment, err := api.(frontend.Committer).Commit(c.X, c.Y)
		if err != nil {
			return err
		}
		api.AssertIsDifferent(commitment, 0)
	}
	return nil
}
func pkFixture(t *testing.T, commits int) ([]byte, []byte, CompiledMetadata) {
	t.Helper()
	compiled, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &pkCircuit{Commits: commits})
	if err != nil {
		t.Fatal(err)
	}
	c := compiled.(*cs.R1CS)
	pk, vk := new(native.ProvingKey), new(native.VerifyingKey)
	if err = native.Setup(c, pk, vk); err != nil {
		t.Fatal(err)
	}
	var pkBytes, vkBytes, csBytes bytes.Buffer
	if _, err = pk.WriteTo(&pkBytes); err != nil {
		t.Fatal(err)
	}
	if _, err = vk.WriteTo(&vkBytes); err != nil {
		t.Fatal(err)
	}
	if _, err = c.WriteTo(&csBytes); err != nil {
		t.Fatal(err)
	}
	m := CompiledMetadata{Schema: "vendetta-hidden-v2-compiled-cs-1", Kind: "test", SHA256: digest(csBytes.Bytes()), Bytes: uint64(csBytes.Len()), Constraints: uint64(c.GetNbConstraints()), Domain: pk.Domain.Cardinality, InternalVariables: uint64(c.GetNbInternalVariables()), SecretVariables: uint64(c.GetNbSecretVariables()), PublicInputs: uint64(c.GetNbPublicVariables() - 1), Commitments: []CompiledCommitment{}}
	for _, item := range c.CommitmentInfo.(constraint.Groth16Commitments) {
		m.Commitments = append(m.Commitments, CompiledCommitment{uint64(item.CommitmentIndex), uint64(len(item.PrivateCommitted)), uint64(len(item.PublicAndCommitmentCommitted)), uint64(item.NbPublicCommitted)})
	}
	return pkBytes.Bytes(), vkBytes.Bytes(), m
}
func TestPKNativeStructure(t *testing.T) {
	for _, commits := range []int{0, 1} {
		t.Run(fmt.Sprint(commits), func(t *testing.T) {
			pk, vk, m := pkFixture(t, commits)
			result, err := CheckPKStructure(bytes.NewReader(pk), digest(pk), vk, digest(vk), m, uint64(len(pk)))
			if err != nil {
				t.Fatal(err)
			}
			if result.BytesRead != uint64(len(pk)) || !result.SharedParametersMatchVK || !result.DimensionsMatchPinnedMetadata || result.AllPKPointsValidated || result.FullKeyRelationVerified || result.ProductionApproved || result.CircuitBindingVerified {
				t.Fatalf("wrong result: %+v", result)
			}
		})
	}
}
func TestPKRejectsMalformedAndSubstituted(t *testing.T) {
	pk, vk, m := pkFixture(t, 1)
	otherPK, otherVK, _ := pkFixture(t, 1)
	_ = otherPK
	offsets := map[string]int{"domain": 0, "alpha": 169, "beta": 201, "delta": 233}
	at := 265
	for _, name := range []string{"A", "B", "Z", "K"} {
		offsets[name] = at
		n := int(binary.BigEndian.Uint32(pk[at:]))
		at += 4 + 32*n
	}
	offsets["beta2"] = at
	offsets["delta2"] = at + 64
	at += 128
	offsets["B2"] = at
	n := int(binary.BigEndian.Uint32(pk[at:]))
	at += 4 + 64*n
	offsets["wires"] = at
	offsets["infinityA"] = at + 8
	offsets["infinityB"] = at + 16
	at += 24
	wires, _, _ := m.dimensions()
	offsets["maskA"] = at
	offsets["maskB"] = at + int(wires)
	at += 2 * int(wires)
	offsets["commitment-count"] = at
	at += 4
	offsets["basis"] = at
	n = int(binary.BigEndian.Uint32(pk[at:]))
	at += 4 + 32*n
	offsets["basis-sigma"] = at
	for name, offset := range offsets {
		t.Run(name, func(t *testing.T) {
			altered := bytes.Clone(pk)
			switch name {
			case "domain", "wires", "infinityA", "infinityB":
				binary.BigEndian.PutUint64(altered[offset:], ^uint64(0))
			case "maskA", "maskB":
				altered[offset] = 2
			case "alpha", "beta", "delta", "beta2", "delta2":
				altered[offset+1] ^= 1
			default:
				binary.BigEndian.PutUint32(altered[offset:], ^uint32(0))
			}
			result, err := CheckPKStructure(bytes.NewReader(altered), digest(altered), vk, digest(vk), m, MaxPKBytes)
			if err == nil || result != nil {
				t.Fatal("malformed PK accepted")
			}
		})
	}
	for name, caseData := range map[string][]byte{"other-VK": otherVK, "wrong-VK-pin": vk} {
		t.Run(name, func(t *testing.T) {
			pin := digest(caseData)
			if name == "wrong-VK-pin" {
				pin = digest(otherVK)
			}
			result, err := CheckPKStructure(bytes.NewReader(pk), digest(pk), caseData, pin, m, MaxPKBytes)
			if err == nil || result != nil {
				t.Fatal("substituted VK accepted")
			}
		})
	}
	for i := 0; i < len(pk); i++ {
		result, err := CheckPKStructure(bytes.NewReader(pk[:i]), digest(pk[:i]), vk, digest(vk), m, MaxPKBytes)
		if err == nil || result != nil {
			t.Fatalf("truncated %d accepted", i)
		}
	}
	for _, altered := range [][]byte{append(bytes.Clone(pk), 0), append(bytes.Clone(pk[:len(pk)-1]), pk[len(pk)-1]^1)} {
		result, err := CheckPKStructure(bytes.NewReader(altered), digest(pk), vk, digest(vk), m, MaxPKBytes)
		if err == nil || result != nil {
			t.Fatal("tampered PK accepted")
		}
	}
}
func TestPKBoundsAndMetadata(t *testing.T) {
	pk, vk, m := pkFixture(t, 0)
	for _, budget := range []uint64{0, 1, MaxPKBytes + 1} {
		result, err := CheckPKStructure(bytes.NewReader(pk), digest(pk), vk, digest(vk), m, budget)
		if err == nil || result != nil {
			t.Fatal("PK budget accepted")
		}
	}
	data, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = ParseCompiledMetadata(data, digest(data), m.SHA256); err != nil {
		t.Fatal(err)
	}
	if _, err = ParseCompiledMetadata(data, digest([]byte("wrong")), m.SHA256); err == nil {
		t.Fatal("metadata pin accepted")
	}
	if _, err = ParseCompiledMetadata(data, digest(data), digest([]byte("other CS"))); err == nil {
		t.Fatal("declared CS substitution accepted")
	}
	m.InternalVariables = ^uint64(0)
	if result, err := CheckPKStructure(bytes.NewReader(pk), digest(pk), vk, digest(vk), m, MaxPKBytes); err == nil || result != nil {
		t.Fatal("unbounded metadata accepted")
	}
}

func TestPKTagScanDoesNotClaimCurveValidation(t *testing.T) {
	pk, vk, m := pkFixture(t, 0)
	// Replace a compact A point with an invalid x-coordinate, preserving the
	// finite compressed tag. A structural scan intentionally cannot detect it.
	altered := bytes.Clone(pk)
	for i := 269; i < 269+32; i++ {
		altered[i] = 0xff
	}
	result, err := CheckPKStructure(bytes.NewReader(altered), digest(altered), vk, digest(vk), m, MaxPKBytes)
	if err != nil {
		t.Fatal(err)
	}
	if result.AllPKPointsValidated || result.FullKeyRelationVerified || result.CircuitBindingVerified || result.ProductionApproved {
		t.Fatal("tag scan overstated native or circuit validation")
	}
}

type unreadPK struct{ called bool }

func (r *unreadPK) Read([]byte) (int, error) {
	r.called = true
	return 0, fmt.Errorf("PK bytes must not be read")
}

func TestPKNativePointValidation(t *testing.T) {
	for _, commits := range []int{0, 1} {
		t.Run(fmt.Sprint(commits), func(t *testing.T) {
			pk, vk, m := pkFixture(t, commits)
			result, err := CheckPKPoints(bytes.NewReader(pk), digest(pk), vk, digest(vk), m, MaxPKBytes, MaxPKValidationPoints)
			if err != nil {
				t.Fatal(err)
			}
			if !result.AllPKPointsValidated || result.Status != "pk-points-structure-and-shared-parameters-verified" || result.CircuitBindingVerified || result.FullKeyRelationVerified || result.MPCTranscriptsVerified || result.ProductionApproved {
				t.Fatalf("wrong point-validation scope: %+v", result)
			}
		})
	}
}
func TestPKNativePointBudgetBeforeInput(t *testing.T) {
	pk, vk, m := pkFixture(t, 0)
	for _, budget := range []uint64{0, 1, MaxPKValidationPoints + 1} {
		r := new(unreadPK)
		result, err := CheckPKPoints(r, digest(pk), vk, digest(vk), m, MaxPKBytes, budget)
		if err == nil || result != nil || r.called {
			t.Fatalf("point budget failed to gate input: %v", err)
		}
	}
	// A large shape must fail even with the highest supported point budget,
	// before native VK decoding or PK reads. The VK is deliberately malformed.
	m.InternalVariables = 100000
	r := new(unreadPK)
	result, err := CheckPKPoints(r, digest(pk), []byte{0}, digest([]byte{0}), m, MaxPKBytes, MaxPKValidationPoints)
	if err == nil || result != nil || r.called || !bytes.Contains([]byte(err.Error()), []byte("point validation exceeds")) {
		t.Fatalf("large shape reached decoding: %v", err)
	}
}
func TestPKNativePointCorruptionAndCanonicality(t *testing.T) {
	pk, vk, m := pkFixture(t, 0)
	z := 265
	for range 2 {
		n := int(binary.BigEndian.Uint32(pk[z:]))
		z += 4 + 32*n
	}
	firstZ := z + 4
	for _, mode := range []string{"invalid-G1", "noncanonical-infinity", "invalid-G2"} {
		t.Run(mode, func(t *testing.T) {
			altered := bytes.Clone(pk)
			offset, size := 269, 32
			if mode == "invalid-G2" {
				at := 265
				for range 4 {
					n := int(binary.BigEndian.Uint32(pk[at:]))
					at += 4 + 32*n
				}
				offset, size = at+128+4, 64
			}
			if mode == "noncanonical-infinity" {
				offset = firstZ
				for i := 0; i < size; i++ {
					altered[offset+i] = 0
				}
				altered[offset] = 0x40
				altered[offset+size-1] = 1
			} else {
				for i := 0; i < size; i++ {
					altered[offset+i] = 0xff
				}
			}
			// The old framing-only mode is intentionally unable to establish this.
			framed, err := CheckPKStructure(bytes.NewReader(altered), digest(altered), vk, digest(vk), m, MaxPKBytes)
			if err != nil || framed.AllPKPointsValidated {
				t.Fatalf("unexpected framing result: %v", err)
			}
			result, err := CheckPKPoints(bytes.NewReader(altered), digest(altered), vk, digest(vk), m, MaxPKBytes, MaxPKValidationPoints)
			if err == nil || result != nil {
				t.Fatal("invalid/noncanonical PK point accepted")
			}
		})
	}
}

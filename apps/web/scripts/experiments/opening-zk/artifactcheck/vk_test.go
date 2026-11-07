package artifactcheck

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	curve "github.com/consensys/gnark-crypto/ecc/bn254"
	native "github.com/consensys/gnark/backend/groth16/bn254"
	cs "github.com/consensys/gnark/constraint/bn254"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

type circuit struct {
	X       frontend.Variable
	Y       frontend.Variable `gnark:",public"`
	Commits int               `gnark:"-"`
}

func (c *circuit) Define(api frontend.API) error {
	api.AssertIsEqual(api.Mul(c.X, c.X), c.Y)
	for i := 0; i < c.Commits; i++ {
		v, err := api.(frontend.Committer).Commit(c.X, c.Y, api.Add(c.X, i+1))
		if err != nil {
			return err
		}
		api.AssertIsDifferent(v, 0)
	}
	return nil
}
func digest(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }
func fixture(t *testing.T, commitments int) ([]byte, []byte) {
	t.Helper()
	compiled, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &circuit{Commits: commitments})
	if err != nil {
		t.Fatal(err)
	}
	pk, vk := new(native.ProvingKey), new(native.VerifyingKey)
	if err = native.Setup(compiled.(*cs.R1CS), pk, vk); err != nil {
		t.Fatal(err)
	}
	var key, source bytes.Buffer
	if _, err = vk.WriteTo(&key); err != nil {
		t.Fatal(err)
	}
	if err = vk.ExportSolidity(&source); err != nil {
		t.Fatal(err)
	}
	return key.Bytes(), source.Bytes()
}
func TestNativeExports(t *testing.T) {
	for _, count := range []int{0, 1} {
		t.Run(fmt.Sprint(count), func(t *testing.T) {
			key, source := fixture(t, count)
			result, err := CheckVKSolidity(key, digest(key), source, digest(source), 1)
			if err != nil {
				t.Fatal(err)
			}
			if !result.VKPointsValidated || !result.VKCanonical || !result.SolidityExportMatches || result.Commitments != count || result.ProductionApproved || result.CircuitBindingVerified || result.ProvingKeyRelationVerified {
				t.Fatalf("wrong scope: %+v", result)
			}
		})
	}
}
func TestSubstitutions(t *testing.T) {
	key, source := fixture(t, 1)
	otherKey, otherSource := fixture(t, 1)
	for name, tc := range map[string]struct {
		key, source       []byte
		keyPin, sourcePin string
		public            int
	}{
		"vk-pin":                    {key, source, digest(otherKey), digest(source), 1},
		"source-pin":                {key, source, digest(key), digest(otherSource), 1},
		"vk-source-relation":        {otherKey, source, digest(otherKey), digest(source), 1},
		"public-count":              {key, source, digest(key), digest(source), 2},
		"unreviewed-export-options": {key, append(bytes.Clone(source), '\n'), digest(key), digest(append(bytes.Clone(source), '\n')), 1},
	} {
		t.Run(name, func(t *testing.T) {
			result, err := CheckVKSolidity(tc.key, tc.keyPin, tc.source, tc.sourcePin, tc.public)
			if err == nil || result != nil {
				t.Fatalf("substitution accepted: %+v %v", result, err)
			}
		})
	}
}
func TestMalformedFraming(t *testing.T) {
	key, source := fixture(t, 1)
	// Locate native prefixes using the fixture's bounded canonical layout.
	k := int(binary.BigEndian.Uint32(key[288:292]))
	outer := 292 + 32*k
	row := outer + 4
	rowLength := int(binary.BigEndian.Uint32(key[row : row+4]))
	keys := row + 4 + 8*rowLength
	for _, name := range []string{"K-count", "outer-count", "row-count", "key-count", "index", "tag", "invalid-point", "trailing"} {
		t.Run(name, func(t *testing.T) {
			altered := bytes.Clone(key)
			switch name {
			case "K-count":
				binary.BigEndian.PutUint32(altered[288:], 0xffffffff)
			case "outer-count":
				binary.BigEndian.PutUint32(altered[outer:], 0xffffffff)
			case "row-count":
				binary.BigEndian.PutUint32(altered[row:], 0xffffffff)
			case "key-count":
				binary.BigEndian.PutUint32(altered[keys:], 0xffffffff)
			case "index":
				if rowLength == 0 {
					t.Fatal("fixture must commit public input")
				}
				binary.BigEndian.PutUint64(altered[row+4:], 0xffffffffffffffff)
			case "tag":
				altered[0] &= 0x3f
			case "invalid-point":
				for i := 0; i < 32; i++ {
					altered[i] = 0xff
				}
			case "trailing":
				altered = append(altered, 0)
			}
			result, err := CheckVKSolidity(altered, digest(altered), source, digest(source), 1)
			if err == nil || result != nil {
				t.Fatalf("malformed native input accepted: %+v %v", result, err)
			}
		})
	}
	for i := 0; i < len(key); i++ {
		result, err := CheckVKSolidity(key[:i], digest(key[:i]), source, digest(source), 1)
		if err == nil || result != nil {
			t.Fatalf("truncation %d accepted", i)
		}
	}
}
func TestBudgets(t *testing.T) {
	for _, tc := range []struct {
		key, source []byte
		public      int
	}{
		{make([]byte, MaxVKBytes+1), []byte{1}, 1},
		{[]byte{1}, make([]byte, MaxSolidityBytes+1), 1},
		{[]byte{1}, []byte{1}, -1}, {[]byte{1}, []byte{1}, MaxPublicInputs + 1},
	} {
		result, err := CheckVKSolidity(tc.key, digest(tc.key), tc.source, digest(tc.source), tc.public)
		if err == nil || result != nil {
			t.Fatal("budget accepted")
		}
	}
	w := limitedWriter{writer: new(bytes.Buffer), remaining: 1}
	if _, err := w.Write([]byte{1, 2}); err == nil {
		t.Fatal("export writer exceeded budget")
	}
}

func TestUnsupportedMultipleCommitments(t *testing.T) {
	key, source := fixture(t, 2)
	result, err := CheckVKSolidity(key, digest(key), source, digest(source), 1)
	if err == nil || result != nil {
		t.Fatal("unsupported Solidity multi-commitment key accepted")
	}
}

func FuzzVKFraming(f *testing.F) {
	_, _, g1, g2 := curve.Generators()
	vk := new(native.VerifyingKey)
	vk.G1.Alpha = g1
	vk.G1.Beta = g1
	vk.G1.Delta = g1
	vk.G1.K = []curve.G1Affine{g1, g1, g1}
	vk.G2.Beta = g2
	vk.G2.Gamma = g2
	vk.G2.Delta = g2
	var seed bytes.Buffer
	if _, err := vk.WriteTo(&seed); err != nil {
		f.Fatal(err)
	}
	f.Add(seed.Bytes())
	f.Add([]byte{})
	f.Add(make([]byte, 560))
	f.Fuzz(func(t *testing.T, data []byte) {
		if len(data) > MaxVKBytes {
			t.Skip()
		}
		_, _ = framing(data, 2)
	})
}

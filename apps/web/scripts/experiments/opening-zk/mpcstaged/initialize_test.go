package mpcstaged

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark-crypto/ecc/bn254/fr/fft"
	"github.com/consensys/gnark/backend"
	"github.com/consensys/gnark/backend/groth16"
	native "github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	"github.com/consensys/gnark/backend/solidity"
	cs "github.com/consensys/gnark/constraint/bn254"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
	"vendetta-opening-pairing-experiment/ceremony"
	"vendetta-opening-pairing-experiment/mpcstream"
)

type testCircuit struct {
	X       frontend.Variable
	Y       frontend.Variable `gnark:",public"`
	Depth   int               `gnark:"-"`
	Commits int               `gnark:"-"`
}

func (c *testCircuit) Define(api frontend.API) error {
	v := c.X
	for range c.Depth {
		v = api.Mul(v, c.X)
	}
	// Exercise signed/general constants; the special coefficient branches also
	// have a direct regression in boundary_test.go.
	api.AssertIsEqual(api.Add(api.Mul(v, 17), api.Mul(c.X, -2), 5), c.Y)
	for i := 0; i < c.Commits; i++ {
		commitment, err := api.(frontend.Committer).Commit(c.X, c.Y, api.Add(v, i+1))
		if err != nil {
			return err
		}
		api.AssertIsDifferent(commitment, 0)
	}
	return nil
}
func raw(t *testing.T, v io.WriterTo) []byte {
	t.Helper()
	var b bytes.Buffer
	if _, err := v.WriteTo(&b); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}
func evalRaw(t *testing.T, e *native.Phase2Evaluations) []byte {
	t.Helper()
	var b bytes.Buffer
	if _, err := mpcstream.WriteEvaluations(&b, e); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}
func fixture(t *testing.T, depth, commits int) (*cs.R1CS, *native.SrsCommons, []byte, OpenCommons) {
	t.Helper()
	compiled, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &testCircuit{Depth: depth, Commits: commits})
	if err != nil {
		t.Fatal(err)
	}
	c := compiled.(*cs.R1CS)
	n := uint64(ecc.NextPowerOfTwo(uint64(c.GetNbConstraints())))
	p := native.NewPhase1(n)
	p.Contribute()
	p.Contribute()
	commons := p.Seal([]byte("unsafe-staged-equivalence-test"))
	body := raw(t, &commons)
	return c, &commons, body, func() (io.ReadCloser, error) { return io.NopCloser(bytes.NewReader(body)), nil }
}
func store(t *testing.T, c *cs.R1CS, body []byte, resume, pin string, emit func(string) error) *Store {
	t.Helper()
	s, err := NewStore(filepath.Join(t.TempDir(), "cache"), ceremony.Digest(raw(t, c)), ceremony.Digest(body), ecc.NextPowerOfTwo(uint64(c.GetNbConstraints())), resume, pin, emit)
	if err != nil {
		t.Fatal(err)
	}
	return s
}
func checkEqual(t *testing.T, c *cs.R1CS, commons *native.SrsCommons, p *native.Phase2, e native.Phase2Evaluations) {
	t.Helper()
	reference := new(native.Phase2)
	expected := reference.Initialize(c, commons)
	if !bytes.Equal(raw(t, reference), raw(t, p)) {
		t.Fatal("phase2 initial native bytes differ")
	}
	if !bytes.Equal(evalRaw(t, &expected), evalRaw(t, &e)) || !reflect.DeepEqual(expected.PublicAndCommitmentCommitted, e.PublicAndCommitmentCommitted) {
		t.Fatal("evaluation bytes/commitment translation differ")
	}
}
func TestNativeEquivalenceAndProof(t *testing.T) {
	for _, depth := range []int{3, 9, 70} {
		for _, commits := range []int{0, 1, 2} {
			t.Run(fmt.Sprintf("depth=%d/commitments=%d", depth, commits), func(t *testing.T) {
				c, commons, body, open := fixture(t, depth, commits)
				s := store(t, c, body, "", "", nil)
				layout, err := Prepare(c, s, open)
				if err != nil {
					t.Fatal(err)
				}
				p, e, err := Assemble(s, layout)
				if err != nil {
					t.Fatal(err)
				}
				checkEqual(t, c, commons, p, e)
				reference := new(native.Phase2)
				reference.Initialize(c, commons)
				p.Contribute()
				if err = reference.Verify(p); err != nil {
					t.Fatal(err)
				}
				next := new(native.Phase2)
				if _, err = next.ReadFrom(bytes.NewReader(raw(t, p))); err != nil {
					t.Fatal(err)
				}
				next.Contribute()
				if err = p.Verify(next); err != nil {
					t.Fatal(err)
				}
				finalBytes := raw(t, next)
				beacon := []byte("unsafe-staged-key-equivalence")
				sealCommons, err := mpcstream.ReadSealCommons(bytes.NewReader(body), s.index.Domain, ceremony.Digest(body), 2<<30)
				if err != nil {
					t.Fatal(err)
				}
				pk, vk, err := Seal(next, &sealCommons, &e, beacon)
				if err != nil {
					t.Fatal(err)
				}
				nativeFirst, nativeNext := new(native.Phase2), new(native.Phase2)
				if _, err = nativeFirst.ReadFrom(bytes.NewReader(raw(t, p))); err != nil {
					t.Fatal(err)
				}
				if _, err = nativeNext.ReadFrom(bytes.NewReader(finalBytes)); err != nil {
					t.Fatal(err)
				}
				expectedPK, expectedVK, err := native.VerifyPhase2(c, commons, beacon, nativeFirst, nativeNext)
				if err != nil {
					t.Fatal(err)
				}
				if !bytes.Equal(raw(t, pk), raw(t, expectedPK)) || !bytes.Equal(raw(t, vk), raw(t, expectedVK)) {
					t.Fatal("sealed native keys differ")
				}
				witness, err := frontend.NewWitness(&testCircuit{X: 1, Y: 20}, ecc.BN254.ScalarField())
				if err != nil {
					t.Fatal(err)
				}
				proof, err := groth16.Prove(c, pk, witness, solidity.WithProverTargetSolidityVerifier(backend.GROTH16))
				if err != nil {
					t.Fatal(err)
				}
				public, err := witness.Public()
				if err != nil {
					t.Fatal(err)
				}
				if err = groth16.Verify(proof, vk, public, solidity.WithVerifierTargetSolidityVerifier(backend.GROTH16)); err != nil {
					t.Fatal(err)
				}
				wrong, err := frontend.NewWitness(&testCircuit{X: 1, Y: 21}, ecc.BN254.ScalarField())
				if err != nil {
					t.Fatal(err)
				}
				wrongPublic, _ := wrong.Public()
				if err = groth16.Verify(proof, vk, wrongPublic, solidity.WithVerifierTargetSolidityVerifier(backend.GROTH16)); err == nil {
					t.Fatal("substituted public input accepted")
				}
			})
		}
	}
}
func TestResumeEveryPersistedBoundary(t *testing.T) {
	c, commons, body, open := fixture(t, 9, 2)
	for stop := 1; stop <= 11; stop++ {
		t.Run(fmt.Sprint(stop), func(t *testing.T) {
			saved := 0
			sentinel := errors.New("simulated interruption")
			s := store(t, c, body, "", "", func(stage string) error {
				if strings.HasPrefix(stage, "cache-persisted-") {
					saved++
					if saved == stop {
						return sentinel
					}
				}
				return nil
			})
			if _, err := Prepare(c, s, open); !errors.Is(err, sentinel) {
				t.Fatalf("missing interruption at %d: %v", stop, err)
			}
			index := filepath.Join(s.dir, fmt.Sprintf("index-%02d.json", stop))
			b, err := os.ReadFile(index)
			if err != nil {
				t.Fatal(err)
			}
			resumed := store(t, c, body, index, ceremony.Digest(b), nil)
			layout, err := Prepare(c, resumed, open)
			if err != nil {
				t.Fatal(err)
			}
			p, e, err := Assemble(resumed, layout)
			if err != nil {
				t.Fatal(err)
			}
			checkEqual(t, c, commons, p, e)
		})
	}
}
func TestCacheRejectsMutationAndWrongContext(t *testing.T) {
	c, _, body, open := fixture(t, 3, 0)
	s := store(t, c, body, "", "", nil)
	layout, err := Prepare(c, s, open)
	if err != nil {
		t.Fatal(err)
	}
	index := filepath.Join(s.dir, "index-11.json")
	data, err := os.ReadFile(index)
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"csHash", "commonsHash", "domain", "productionApproved"} {
		t.Run(field, func(t *testing.T) {
			var altered map[string]any
			json.Unmarshal(data, &altered)
			switch field {
			case "domain":
				altered[field] = uint64(1) << 20
			case "productionApproved":
				altered[field] = true
			default:
				altered[field] = strings.Repeat("f", 64)
			}
			b, _ := json.Marshal(altered)
			path := filepath.Join(t.TempDir(), "wrong.json")
			os.WriteFile(path, b, 0600)
			_, err := NewStore(filepath.Join(t.TempDir(), "cache"), s.index.CSHash, s.index.CommonsHash, s.index.Domain, path, ceremony.Digest(b), nil)
			if err == nil {
				t.Fatal("changed context accepted")
			}
		})
	}
	vector := s.index.Files["a"]
	original, err := os.ReadFile(vector.Path)
	if err != nil {
		t.Fatal(err)
	}
	for _, mutation := range []string{"point", "count", "truncated", "trailing"} {
		t.Run(mutation, func(t *testing.T) {
			b := append([]byte{}, original...)
			switch mutation {
			case "point":
				b[len(b)-1] ^= 1
			case "count":
				b[0] = 255
			case "truncated":
				b = b[:len(b)-1]
			case "trailing":
				b = append(b, 0)
			}
			os.WriteFile(vector.Path, b, 0600)
			if _, _, err = Assemble(s, layout); err == nil {
				t.Fatal("mutated cached vector accepted")
			}
			os.WriteFile(vector.Path, original, 0600)
		})
	}
}

func TestInverseOnlyTablesMatchNativeDomain(t *testing.T) {
	for _, size := range []int{2, 4, 8, 16, 256, 2048, 16384} {
		t.Run(fmt.Sprint(size), func(t *testing.T) {
			native := fft.NewDomain(uint64(size))
			want, err := native.TwiddlesInv()
			if err != nil {
				t.Fatal(err)
			}
			domain, got := inverseDomain(size)
			if !reflect.DeepEqual(got, want) || !domain.CardinalityInv.Equal(&native.CardinalityInv) || !domain.GeneratorInv.Equal(&native.GeneratorInv) {
				t.Fatal("inverse twiddle tables or normalization differ")
			}
			if _, err = domain.CosetTable(); err == nil {
				t.Fatal("unused coset allocated")
			}
			if _, err = domain.Twiddles(); err == nil {
				t.Fatal("unused forward twiddles allocated")
			}
		})
	}
}

package mpcinspect

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"io"
	"os"
	"runtime"
	"strings"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	cs "github.com/consensys/gnark/constraint/bn254"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
	"vendetta-opening-pairing-experiment/ceremony"
)

type tiny struct {
	X     frontend.Variable
	Y     frontend.Variable `gnark:",public"`
	Count int               `gnark:"-"`
}

func (c *tiny) Define(api frontend.API) error {
	api.AssertIsEqual(api.Mul(c.X, c.X), c.Y)
	for i := 0; i < c.Count; i++ {
		v, err := api.(frontend.Committer).Commit(api.Add(c.X, i+1), c.Y)
		if err != nil {
			return err
		}
		api.AssertIsDifferent(v, 0)
	}
	return nil
}

func wire(t testing.TB, value io.WriterTo) []byte {
	t.Helper()
	var b bytes.Buffer
	if _, err := value.WriteTo(&b); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func fixtures(t testing.TB, count int) (Shape, []byte, Shape, []byte) {
	t.Helper()
	compiled, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &tiny{Count: count})
	if err != nil {
		t.Fatal(err)
	}
	n := ecc.NextPowerOfTwo(uint64(compiled.GetNbConstraints()))
	if n < 2 {
		n = 2
	}
	shape1 := Shape{Schema: "vendetta-hidden-v2-native-shape-1", CircuitSHA256: ceremony.Digest(wire(t, compiled)),
		Phase: 1, Domain: n, PrivateCommitted: []uint64{}}
	p1 := mpcsetup.NewPhase1(n)
	p1.Contribute()
	raw1 := wire(t, p1)
	commons := p1.Seal([]byte("framing-test-only"))
	p2 := new(mpcsetup.Phase2)
	p2.Initialize(compiled.(*cs.R1CS), &commons)
	p2.Contribute()
	shape2 := shape1
	shape2.Phase = 2
	shape2.Private = uint64(len(p2.Parameters.G1.PKK))
	shape2.PrivateCommitted = make([]uint64, len(p2.Parameters.G1.SigmaCKK))
	for i, points := range p2.Parameters.G1.SigmaCKK {
		shape2.PrivateCommitted[i] = uint64(len(points))
	}
	return shape1, raw1, shape2, wire(t, p2)
}

func TestNativeFraming(t *testing.T) {
	for _, count := range []int{0, 1, 2} {
		t.Run(string(rune('0'+count))+"-commitments", func(t *testing.T) {
			s1, r1, s2, r2 := fixtures(t, count)
			for i, shape := range []Shape{s1, s2} {
				raw := [][]byte{r1, r2}[i]
				size, err := shape.Size()
				if err != nil || size != uint64(len(raw)) {
					t.Fatalf("wire size %d/%d: %v", size, len(raw), err)
				}
				result, err := Scan(bytes.NewReader(raw), shape, ceremony.Digest(raw), size)
				if err != nil {
					t.Fatal(err)
				}
				if !result.FramingChecked || result.PointsValidated || result.CircuitBytesVerified || result.MPCTranscriptVerified || result.ArtifactBytesVerified || result.ProductionApproved {
					t.Fatal("framing inspection claimed additional verification")
				}
				for cut := 0; cut < len(raw); cut++ {
					if _, err := Scan(bytes.NewReader(raw[:cut]), shape, ceremony.Digest(raw), size); err == nil {
						t.Fatalf("truncated at %d accepted", cut)
					}
				}
				extra := append(append([]byte{}, raw...), 0)
				if _, err := Scan(bytes.NewReader(extra), shape, ceremony.Digest(extra), size+1); err == nil {
					t.Fatal("trailing byte accepted")
				}
			}
		})
	}
}

func TestHostileNativeLengths(t *testing.T) {
	s1, r1, s2, r2 := fixtures(t, 1)
	mutations := map[string]struct {
		shape  Shape
		raw    []byte
		offset int
		width  int
	}{
		"domain": {s1, r1, 288, 8}, "commitments": {s2, r2, 0, 2},
		"private": {s2, r2, 34, 4}, "z": {s2, r2, 38 + int(s2.Private)*32, 4},
		"sigma": {s2, r2, 38 + int(s2.Private)*32 + 4 + int(s2.Domain-1)*32 + 64, 4},
	}
	for name, test := range mutations {
		t.Run(name, func(t *testing.T) {
			raw := append([]byte{}, test.raw...)
			for i := 0; i < test.width; i++ {
				raw[test.offset+i] = 255
			}
			if _, err := Scan(bytes.NewReader(raw), test.shape, ceremony.Digest(raw), uint64(len(raw))); err == nil {
				t.Fatal("length bomb accepted")
			}
		})
	}
	for name, mutate := range map[string]func([]byte){
		"raw-point":       func(b []byte) { b[0] &= 0x3f },
		"empty-challenge": func(b []byte) { b[len(b)-33] = 0 },
		"short-challenge": func(b []byte) { b[len(b)-33] = 31 },
		"long-challenge":  func(b []byte) { b[len(b)-33] = 255 },
	} {
		t.Run(name, func(t *testing.T) {
			raw := append([]byte{}, r1...)
			mutate(raw)
			if _, err := Scan(bytes.NewReader(raw), s1, ceremony.Digest(raw), uint64(len(raw))); err == nil {
				t.Fatal("unsafe encoding accepted")
			}
		})
	}
}

type noRead struct{ calls int }

func (r *noRead) Read([]byte) (int, error) { r.calls++; return 0, io.EOF }

func TestBudgetBeforeRead(t *testing.T) {
	shape := Shape{Schema: "vendetta-hidden-v2-native-shape-1", CircuitSHA256: strings.Repeat("a", 64), Phase: 1, Domain: MaxDomain, PrivateCommitted: []uint64{}}
	r := new(noRead)
	if _, err := Scan(r, shape, strings.Repeat("b", 64), 64*1024); err == nil || r.calls != 0 {
		t.Fatal("large shape read before byte budget validation")
	}
	if n, err := shape.Size(); err != nil || n != 192*MaxDomain+265 {
		t.Fatal("game domain size model differs")
	}
	for name, mutate := range map[string]func(*Shape){
		"domain-overflow":      func(s *Shape) { s.Domain = ^uint64(0) },
		"non-power-two":        func(s *Shape) { s.Domain = 3 },
		"private-overflow":     func(s *Shape) { s.Phase = 2; s.Private = ^uint64(0) },
		"sigma-overflow":       func(s *Shape) { s.Phase = 2; s.PrivateCommitted = []uint64{^uint64(0)} },
		"sum-overflow":         func(s *Shape) { s.Phase = 2; s.PrivateCommitted = []uint64{maxPrivate, maxPrivate} },
		"too-many-commitments": func(s *Shape) { s.Phase = 2; s.PrivateCommitted = make([]uint64, 256) },
	} {
		t.Run(name, func(t *testing.T) {
			s := shape
			mutate(&s)
			r := new(noRead)
			if _, err := Scan(r, s, strings.Repeat("b", 64), MaxTranscriptBytes); err == nil || r.calls != 0 {
				t.Fatal("hostile shape read native input")
			}
		})
	}
}

func TestShapePolicy(t *testing.T) {
	shape, raw, _, _ := fixtures(t, 0)
	data, err := json.Marshal(shape)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ParseShape(data, ceremony.Digest(data)); err != nil {
		t.Fatal(err)
	}
	for name, data := range map[string][]byte{
		"unknown":         bytes.Replace(data, []byte(`"schema":`), []byte(`"unknown":1,"schema":`), 1),
		"duplicate":       bytes.Replace(data, []byte(`"phase":1`), []byte(`"phase":1,"phase":1`), 1),
		"null":            bytes.Replace(data, []byte(`"privateCommitted":[]`), []byte(`"privateCommitted":null`), 1),
		"alias":           bytes.Replace(data, []byte(`"phase":`), []byte(`"Phase":`), 1),
		"trailing":        append(append([]byte{}, data...), []byte(` {}`)...),
		"missing-private": bytes.Replace(data, []byte(`"private":0,`), nil, 1),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := ParseShape(data, ceremony.Digest(data)); err == nil {
				t.Fatal("ambiguous shape accepted")
			}
		})
	}
	if _, err := ParseShape(data, strings.Repeat("0", 64)); err == nil {
		t.Fatal("wrong shape pin accepted")
	}
	if _, err := Scan(bytes.NewReader(raw), shape, strings.Repeat("0", 64), uint64(len(raw))); err == nil {
		t.Fatal("wrong transcript pin accepted")
	}
}

func TestFramingDoesNotValidatePoints(t *testing.T) {
	shape, raw, _, _ := fixtures(t, 0)
	for i := 0; i < 32; i++ {
		raw[i] = 255
	}
	raw[0] = 0xbf
	result, err := Scan(bytes.NewReader(raw), shape, ceremony.Digest(raw), uint64(len(raw)))
	if err != nil || result.PointsValidated || !result.FramingChecked {
		t.Fatal("framing/curve boundary changed", err)
	}
	if _, err := new(mpcsetup.Phase1).ReadFrom(bytes.NewReader(raw)); err == nil {
		t.Fatal("fixture must contain an invalid native point")
	}
}

// A forged length must be rejected at its prefix, without consuming its payload.
func TestVectorBombStopsAtPrefix(t *testing.T) {
	_, _, shape, raw := fixtures(t, 1)
	binary.BigEndian.PutUint32(raw[34:38], ^uint32(0))
	r := &chunkReader{raw: raw}
	if _, err := Scan(r, shape, ceremony.Digest(raw), uint64(len(raw))); err == nil {
		t.Fatal("bomb accepted")
	}
	if r.read != 38 {
		t.Fatalf("read %d bytes past hostile length", r.read)
	}
}

type chunkReader struct {
	raw  []byte
	read int
}

func TestStreamingMemoryBudget(t *testing.T) {
	shape := Shape{Schema: "vendetta-hidden-v2-native-shape-1", CircuitSHA256: strings.Repeat("a", 64),
		Phase: 1, Domain: 1 << 14, PrivateCommitted: []uint64{}}
	size, err := shape.Size()
	if err != nil {
		t.Fatal(err)
	}
	// Synthetic compressed tags only, not curve points or cryptographic evidence.
	// Materialize test input before accounting; Scan must not copy that input.
	raw := make([]byte, size)
	for off := 0; off < 288; off += 32 {
		raw[off] = 0x80
	}
	binary.BigEndian.PutUint64(raw[288:296], shape.Domain)
	for off := 296; off < len(raw)-33; off += 32 {
		raw[off] = 0x80
	}
	raw[len(raw)-33] = 32
	pin := ceremony.Digest(raw)
	runtime.GC()
	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)
	if _, err := Scan(bytes.NewReader(raw), shape, pin, size); err != nil {
		t.Fatal(err)
	}
	runtime.ReadMemStats(&after)
	if used := after.TotalAlloc - before.TotalAlloc; used > 512*1024 {
		t.Fatalf("streaming scan allocated %d bytes for %d-byte input", used, size)
	}
}

func TestReproducedGameDimensionsWithoutReading(t *testing.T) {
	data, err := os.ReadFile("../../../../../../docs/benchmarks/timelock-opening/cs-reproduction/compile-report.json")
	if err != nil {
		t.Fatal(err)
	}
	if ceremony.Digest(data) != "a45e4f7a982c0ed044e0676ef089585cc8f48529c6ac0f1a3c3fab66f239297c" {
		t.Fatal("reproduction fixture changed")
	}
	var report struct {
		Samples []struct {
			Kind     string `json:"kind"`
			Compiled struct {
				SHA256      string `json:"sha256"`
				Domain      uint64 `json:"domain"`
				Internal    uint64 `json:"internalVariables"`
				Secret      uint64 `json:"secretVariables"`
				Commitments []struct {
					Private uint64 `json:"privateCommitted"`
				} `json:"commitments"`
			} `json:"compiled"`
		} `json:"samples"`
	}
	if err := json.Unmarshal(data, &report); err != nil {
		t.Fatal(err)
	}
	for _, sample := range report.Samples {
		for phase := uint64(1); phase <= 2; phase++ {
			t.Run(sample.Kind+string(rune('0'+phase)), func(t *testing.T) {
				c := sample.Compiled
				shape := Shape{Schema: "vendetta-hidden-v2-native-shape-1", CircuitSHA256: c.SHA256, Domain: c.Domain, Phase: phase, PrivateCommitted: []uint64{}}
				if phase == 2 {
					shape.Private = c.Internal + c.Secret - uint64(len(c.Commitments))
					for _, commitment := range c.Commitments {
						shape.Private -= commitment.Private
						shape.PrivateCommitted = append(shape.PrivateCommitted, commitment.Private)
					}
				}
				if _, err := shape.Size(); err != nil {
					t.Fatal(err)
				}
				r := new(noRead)
				if _, err := Scan(r, shape, strings.Repeat("a", 64), 64*1024); err == nil || r.calls != 0 {
					t.Fatal("game transcript read without explicit byte budget")
				}
			})
		}
	}
}

func (r *chunkReader) Read(b []byte) (int, error) {
	if r.read == len(r.raw) {
		return 0, io.EOF
	}
	b = b[:1]
	b[0] = r.raw[r.read]
	r.read++
	return 1, nil
}

package mpcinspect

import (
	"bytes"
	"context"
	"encoding/binary"
	"io"
	"os"
	"os/exec"
	"reflect"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	cs "github.com/consensys/gnark/constraint/bn254"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
	"vendetta-opening-pairing-experiment/ceremony"
)

func TestGuardMatchesFramingAndRejectsUnread(t *testing.T) {
	s1, r1, s2, r2 := fixtures(t, 2)
	for i, shape := range []Shape{s1, s2} {
		raw := [][]byte{r1, r2}[i]
		g, err := NewGuard(bytes.NewReader(raw), shape, ceremony.Digest(raw), uint64(len(raw)))
		if err != nil {
			t.Fatal(err)
		}
		var out bytes.Buffer
		// Consumer reads one byte at a time, including split allocation prefixes.
		for {
			var b [1]byte
			n, err := g.Read(b[:])
			out.Write(b[:n])
			if err == io.EOF {
				break
			}
			if err != nil {
				t.Fatal(err)
			}
		}
		if !bytes.Equal(raw, out.Bytes()) || g.Finish() != nil {
			t.Fatal("guard changed bytes")
		}
		g, err = NewGuard(bytes.NewReader(raw), shape, ceremony.Digest(raw), uint64(len(raw)))
		if err != nil {
			t.Fatal(err)
		}
		if g.Finish() == nil || g.Finish() == nil {
			t.Fatal("partial consumption was accepted")
		}
	}
}

func TestGuardRejectsPrefixesBeforeForwarding(t *testing.T) {
	s1, r1, s2, r2 := fixtures(t, 1)
	for name, test := range map[string]struct {
		shape         Shape
		raw           []byte
		offset, width int
	}{
		"domain": {s1, r1, 288, 8}, "commitments": {s2, r2, 0, 2}, "private": {s2, r2, 34, 4},
		"z":                {s2, r2, 38 + int(s2.Private)*32, 4},
		"sigma":            {s2, r2, 38 + int(s2.Private)*32 + 4 + int(s2.Domain-1)*32 + 64, 4},
		"phase1-challenge": {s1, r1, len(r1) - 33, 1},
		"phase2-challenge": {s2, r2, len(r2) - 33, 1},
	} {
		t.Run(name, func(t *testing.T) {
			raw := append([]byte{}, test.raw...)
			for j := 0; j < test.width; j++ {
				raw[test.offset+j] = 255
			}
			g, err := NewGuard(bytes.NewReader(raw), test.shape, ceremony.Digest(raw), uint64(len(raw)))
			if err != nil {
				t.Fatal(err)
			}
			out, err := io.ReadAll(g)
			if err == nil || len(out) != test.offset {
				t.Fatalf("guard forwarded hostile prefix: %d/%d: %v", len(out), test.offset, err)
			}
		})
	}
}

func TestNativeDecodeAndMPC(t *testing.T) {
	s1, r1, s2, r2 := fixtures(t, 1)
	d1, err := Decode(bytes.NewReader(r1), s1, ceremony.Digest(r1), uint64(len(r1)), 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	d2, err := Decode(bytes.NewReader(r2), s2, ceremony.Digest(r2), uint64(len(r2)), 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	for _, d := range []*Native{d1, d2} {
		if !d.Result.PointsValidated || !d.Result.CanonicalSerializationChecked || !d.Result.FramingChecked || d.Result.MPCTranscriptVerified || d.Result.ProductionApproved || d.Result.CircuitBytesVerified {
			t.Fatal("incorrect native validation scope")
		}
	}
	commons, err := mpcsetup.VerifyPhase1(s1.Domain, []byte("framing-test-only"), d1.Phase1)
	if err != nil {
		t.Fatal(err)
	}
	compiled, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &tiny{Count: 1})
	if err != nil {
		t.Fatal(err)
	}
	pk, vk, err := mpcsetup.VerifyPhase2(compiled.(*cs.R1CS), &commons, []byte("guarded-import-test-only"), d2.Phase2)
	if err != nil {
		t.Fatal(err)
	}
	witness, err := frontend.NewWitness(&tiny{X: 3, Y: 9, Count: 1}, ecc.BN254.ScalarField())
	if err != nil {
		t.Fatal(err)
	}
	proof, err := groth16.Prove(compiled, pk, witness)
	if err != nil {
		t.Fatal(err)
	}
	pub, err := witness.Public()
	if err != nil {
		t.Fatal(err)
	}
	if err := groth16.Verify(proof, vk, pub); err != nil {
		t.Fatal(err)
	}
	wrong, err := frontend.NewWitness(&tiny{Y: 8, Count: 1}, ecc.BN254.ScalarField(), frontend.PublicOnly())
	if err != nil {
		t.Fatal(err)
	}
	if err := groth16.Verify(proof, vk, wrong); err == nil {
		t.Fatal("substituted public input accepted")
	}
}

func TestShapesBoundToCompiledBytes(t *testing.T) {
	for _, count := range []int{0, 1, 2} {
		s1, r1, s2, r2 := fixtures(t, count)
		compiled, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &tiny{Count: count})
		if err != nil {
			t.Fatal(err)
		}
		for i, expected := range []Shape{s1, s2} {
			actual, err := ShapeFromCS(compiled.(*cs.R1CS), expected.CircuitSHA256, uint64(i+1))
			if err != nil || !reflect.DeepEqual(actual, expected) {
				t.Fatalf("compiled/native shape differs: %v %+v %+v", err, actual, expected)
			}
			if actual, err := ShapeFromCS(compiled.(*cs.R1CS), strings.Repeat("0", 64), uint64(i+1)); err == nil || actual.Schema != "" {
				t.Fatal("wrong CS pin returned usable shape")
			}
			raw := [][]byte{r1, r2}[i]
			if decoded, err := Decode(bytes.NewReader(raw), actual, ceremony.Digest(raw), uint64(len(raw)), 1<<20); err != nil || decoded == nil {
				t.Fatalf("native decode with %d commitments: %v", count, err)
			}
		}
	}
}

func TestNativeDecodeFailureReturnsNoObject(t *testing.T) {
	shape, raw, _, _ := fixtures(t, 0)
	for name, change := range map[string]func([]byte) []byte{
		"point": func(b []byte) []byte {
			for i := 0; i < 32; i++ {
				b[i] = 255
			}
			b[0] = 0xbf
			return b
		},
		"infinity-encoding": func(b []byte) []byte { b[0] = 0x40; b[1] = 1; return b },
		"truncated":         func(b []byte) []byte { return b[:len(b)-1] },
		"trailing":          func(b []byte) []byte { return append(b, 0) },
	} {
		t.Run(name, func(t *testing.T) {
			b := change(append([]byte{}, raw...))
			obj, err := Decode(bytes.NewReader(b), shape, ceremony.Digest(b), MaxTranscriptBytes, 1<<20)
			if err == nil || obj != nil {
				t.Fatal("bad native input returned object")
			}
		})
	}
	if obj, err := Decode(bytes.NewReader(raw), shape, strings.Repeat("0", 64), MaxTranscriptBytes, 1<<20); err == nil || obj != nil {
		t.Fatal("bad digest returned native object")
	}
	r := new(noRead)
	shape.Domain = MaxDomain
	if obj, err := Decode(r, shape, ceremony.Digest(raw), MaxTranscriptBytes, 1<<20); err == nil || obj != nil || r.calls != 0 {
		t.Fatal("game domain decoded without point budget")
	}
}

func TestNativeBombsUnderKernelLimits(t *testing.T) {
	if os.Getenv("VENDETTA_NATIVE_BOMB_CHILD") == "1" {
		for key, value := range map[int]uint64{syscall.RLIMIT_AS: 4 << 30, syscall.RLIMIT_CPU: 10, syscall.RLIMIT_CORE: 0} {
			if err := syscall.Setrlimit(key, &syscall.Rlimit{Cur: value, Max: value}); err != nil {
				t.Fatal(err)
			}
		}
		s1, r1, s2, r2 := fixtures(t, 1)
		for _, test := range []struct {
			shape         Shape
			raw           []byte
			offset, width int
		}{
			{s1, r1, 288, 8}, {s2, r2, 0, 2}, {s2, r2, 34, 4},
			{s2, r2, 38 + int(s2.Private)*32, 4},
			{s2, r2, 38 + int(s2.Private)*32 + 4 + int(s2.Domain-1)*32 + 64, 4},
		} {
			raw := append([]byte{}, test.raw...)
			if test.width == 8 {
				binary.BigEndian.PutUint64(raw[test.offset:], ^uint64(0))
			} else {
				for i := 0; i < test.width; i++ {
					raw[test.offset+i] = 255
				}
			}
			if obj, err := Decode(bytes.NewReader(raw), test.shape, ceremony.Digest(raw), MaxTranscriptBytes, 1<<20); err == nil || obj != nil {
				t.Fatal("native bomb accepted")
			}
		}
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestNativeBombsUnderKernelLimits$", "-test.count=1")
	cmd.Env = append(os.Environ(), "VENDETTA_NATIVE_BOMB_CHILD=1", "GOMEMLIMIT=256MiB", "GOMAXPROCS=2")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true, Pdeathsig: syscall.SIGKILL}
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return os.ErrProcessDone
		}
		return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	}
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("bounded native bomb child: %v %s", err, out)
	}
}

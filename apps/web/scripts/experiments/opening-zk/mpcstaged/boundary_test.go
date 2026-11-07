package mpcstaged

import (
	"bytes"
	"encoding/binary"
	"io"
	"math/big"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"syscall"
	"testing"

	curve "github.com/consensys/gnark-crypto/ecc/bn254"
	"github.com/consensys/gnark/constraint"
	"vendetta-opening-pairing-experiment/ceremony"
)

func TestPrepareRejectsMissingCommonsOpener(t *testing.T) {
	c, _, body, _ := fixture(t, 3, 0)
	s := store(t, c, body, "", "", nil)
	if _, err := Prepare(c, s, nil); err == nil {
		t.Fatal("missing commons opener accepted")
	}
	if s.layout != nil {
		t.Fatal("failed prepare retained an assembly layout")
	}
}

func TestPrepareFailureInvalidatesAssemblyLayout(t *testing.T) {
	c, _, body, open := fixture(t, 9, 2)
	s := store(t, c, body, "", "", nil)
	layout, err := Prepare(c, s, open)
	if err != nil {
		t.Fatal(err)
	}
	c.Coefficients[constraint.CoeffIdMinusTwo+1].SetUint64(19)
	if _, err := Prepare(c, s, open); err == nil {
		t.Fatal("substituted CS accepted")
	}
	emitted := false
	s.emit = func(string) error { emitted = true; return nil }
	if p, _, err := Assemble(s, layout); err == nil || p != nil || emitted {
		t.Fatal("failed preparation left a usable assembly layout")
	}
}

func TestPrepareRejectsPinnedMalformedLayoutBeforeWork(t *testing.T) {
	for _, mode := range []string{"overcommitted", "reordered", "duplicate-private"} {
		t.Run(mode, func(t *testing.T) {
			c, _, body, _ := fixture(t, 9, 2)
			commitments := c.CommitmentInfo.(constraint.Groth16Commitments)
			switch mode {
			case "overcommitted":
				commitments[0].PrivateCommitted = make([]int, c.GetNbInternalVariables()+c.GetNbSecretVariables()+1)
			case "reordered":
				slices.Reverse(commitments)
			case "duplicate-private":
				commitments[0].PrivateCommitted = []int{c.GetNbPublicVariables(), c.GetNbPublicVariables()}
			}
			s := store(t, c, body, "", "", nil)
			emitted := false
			s.emit = func(string) error { emitted = true; return nil }
			_, err := Prepare(c, s, func() (io.ReadCloser, error) {
				t.Fatal("malformed layout opened commons")
				return nil, io.ErrClosedPipe
			})
			if err == nil || emitted {
				t.Fatal("malformed pinned layout reached cache work")
			}
		})
	}
}

func TestAccumulatorSpecialCoefficientBranches(t *testing.T) {
	_, _, g1, g2 := curve.Generators()
	for _, c := range []struct{ id, value int }{{constraint.CoeffIdZero, 0}, {constraint.CoeffIdOne, 1}, {constraint.CoeffIdMinusOne, -1}, {constraint.CoeffIdTwo, 2}} {
		term := constraint.Term{CID: uint32(c.id)}
		a, b := g1, g2
		accumulateG1(nil, &a, term, &g1)
		accumulateG2(nil, &b, term, &g2)
		var expectedG1 curve.G1Affine
		var expectedG2 curve.G2Affine
		scalar := big.NewInt(int64(1 + c.value))
		expectedG1.ScalarMultiplication(&g1, scalar)
		expectedG2.ScalarMultiplication(&g2, scalar)
		if !a.Equal(&expectedG1) || !b.Equal(&expectedG2) {
			t.Fatalf("special coefficient %d differs", c.id)
		}
	}
}

func TestGroupFFTSchedulingBranchesAgree(t *testing.T) {
	_, _, g1, g2 := curve.Generators()
	const size = 32
	a, b := make([]curve.G1Affine, size), make([]curve.G2Affine, size)
	for i := range size {
		scalar := big.NewInt(int64(i*i + 1))
		a[i].ScalarMultiplication(&g1, scalar)
		b[i].ScalarMultiplication(&g2, scalar)
	}
	otherA, otherB := slices.Clone(a), slices.Clone(b)
	_, twiddles := inverseDomain(size)
	difFFTG1(a, twiddles, 0, 0, nil)
	difFFTG1(otherA, twiddles, 0, 8, nil)
	difFFTG2(b, twiddles, 0, 0, nil)
	difFFTG2(otherB, twiddles, 0, 8, nil)
	for i := range size {
		if !a[i].Equal(&otherA[i]) || !b[i].Equal(&otherB[i]) {
			t.Fatalf("sequential/parallel FFT differ at %d", i)
		}
	}
}

func TestCacheRejectsPinnedG2OutsideSubgroup(t *testing.T) {
	_, _, _, generator := curve.Generators()
	var twist, x3 curve.E2
	twist.Square(&generator.Y)
	x3.Square(&generator.X).Mul(&x3, &generator.X)
	twist.Sub(&twist, &x3)
	var point curve.G2Affine
	found := false
	for i := uint64(0); i < 100; i++ {
		point.X.A0.SetUint64(i)
		var rhs curve.E2
		rhs.Square(&point.X).Mul(&rhs, &point.X).Add(&rhs, &twist)
		if rhs.Legendre() < 0 {
			continue
		}
		point.Y.Sqrt(&rhs)
		if point.IsOnCurve() && !point.IsInSubGroup() {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("bounded non-subgroup fixture not found")
	}
	encoded := point.Bytes()
	var checked curve.G2Affine
	if _, err := checked.SetBytes(encoded[:]); err == nil || !strings.Contains(strings.ToLower(err.Error()), "subgroup") {
		t.Fatalf("native fixture did not reach subgroup rejection: %v", err)
	}
	data := make([]byte, 4)
	binary.BigEndian.PutUint32(data, 1)
	data = append(data, encoded[:]...)
	path := filepath.Join(t.TempDir(), "non-subgroup.bin")
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	s, err := NewStore(filepath.Join(t.TempDir(), "cache"), strings.Repeat("a", 64), strings.Repeat("b", 64), 8, "", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	s.index.Files["g2-b"] = Vector{Path: path, SHA256: ceremony.Digest(data), Count: 1, G2: true}
	points, err := s.LoadG2("g2-b", 1)
	if err == nil || points != nil {
		t.Fatalf("pinned on-curve non-subgroup result: points=%d err=%v", len(points), err)
	}
}

func TestAssembleRejectsSubstitutedLayout(t *testing.T) {
	for _, mode := range []string{"truncated", "reordered", "private-wire", "public", "unprepared"} {
		t.Run(mode, func(t *testing.T) {
			c, _, body, open := fixture(t, 9, 2)
			s := store(t, c, body, "", "", nil)
			layout, err := Prepare(c, s, open)
			if err != nil {
				t.Fatal(err)
			}
			switch mode {
			case "truncated":
				layout.Commitments = layout.Commitments[:1]
			case "reordered":
				slices.Reverse(layout.Commitments)
			case "private-wire":
				layout.Commitments[0].PrivateCommitted[0]++
			case "public":
				layout.Public++
			case "unprepared":
				// A new store must call Prepare even when its pinned cache is complete.
				index := filepath.Join(s.dir, "index-11.json")
				data, err := os.ReadFile(index)
				if err != nil {
					t.Fatal(err)
				}
				s = store(t, c, body, index, ceremony.Digest(data), nil)
			}
			emitted := false
			s.emit = func(string) error { emitted = true; return nil }
			p, _, err := Assemble(s, layout)
			if err == nil || p != nil || emitted {
				t.Fatalf("substituted layout used: err=%v emitted=%v", err, emitted)
			}
		})
	}
}

func TestCacheRegularDescriptorBoundaries(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "input.json")
	if err := os.WriteFile(path, []byte("{}"), 0600); err != nil {
		t.Fatal(err)
	}
	t.Run("nonblocking-regular", func(t *testing.T) {
		f, err := regular(path)
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		flags, _, errno := syscall.Syscall(syscall.SYS_FCNTL, f.Fd(), syscall.F_GETFL, 0)
		if errno != 0 || flags&syscall.O_NONBLOCK == 0 {
			t.Fatalf("cache open may block before descriptor validation: flags=%x err=%v", flags, errno)
		}
	})
	link := filepath.Join(dir, "link")
	if err := os.Symlink(path, link); err != nil {
		t.Fatal(err)
	}
	fifo := filepath.Join(dir, "fifo")
	if err := syscall.Mkfifo(fifo, 0600); err != nil {
		t.Fatal(err)
	}
	for name, path := range map[string]string{"symlink": link, "fifo": fifo, "directory": dir, "missing": filepath.Join(dir, "missing")} {
		t.Run(name, func(t *testing.T) {
			f, err := regular(path)
			if f != nil {
				f.Close()
			}
			if err == nil || f != nil {
				t.Fatalf("special cache input returned descriptor: %v", err)
			}
		})
	}
}

func TestPrepareRejectsSubstitutedCSBeforeCacheUse(t *testing.T) {
	for _, resume := range []bool{false, true} {
		t.Run(map[bool]string{false: "fresh", true: "resume"}[resume], func(t *testing.T) {
			c, _, body, open := fixture(t, 3, 0)
			s := store(t, c, body, "", "", nil)
			if resume {
				if _, err := Prepare(c, s, open); err != nil {
					t.Fatal(err)
				}
				index := filepath.Join(s.dir, "index-11.json")
				data, err := os.ReadFile(index)
				if err != nil {
					t.Fatal(err)
				}
				s = store(t, c, body, index, ceremony.Digest(data), nil)
			}
			// Keep dimensions unchanged while replacing the relation's constants.
			before := raw(t, c)
			c.Coefficients[constraint.CoeffIdTwo+1].SetUint64(19)
			if bytes.Equal(before, raw(t, c)) {
				t.Fatal("CS mutation did not change bytes")
			}
			opened, emitted := false, false
			s.emit = func(string) error { emitted = true; return nil }
			_, err := Prepare(c, s, func() (io.ReadCloser, error) {
				opened = true
				return open()
			})
			if err == nil || opened || emitted {
				t.Fatalf("substituted CS reached cache work: err=%v opened=%v emitted=%v", err, opened, emitted)
			}
		})
	}
}

func TestFailedCacheLoadReturnsNoPoints(t *testing.T) {
	for _, g2 := range []bool{false, true} {
		t.Run(map[bool]string{false: "G1", true: "G2"}[g2], func(t *testing.T) {
			c, _, body, _ := fixture(t, 3, 0)
			s := store(t, c, body, "", "", nil)
			const count = 2
			size := 32
			if g2 {
				size = 64
			}
			data := make([]byte, 4+count*size)
			binary.BigEndian.PutUint32(data, count)
			// Uncompressed flags require more bytes than this fixed-size vector.
			// The pin intentionally matches: test native decoding, not the hash check.
			path := filepath.Join(t.TempDir(), "bad.bin")
			if err := os.WriteFile(path, data, 0600); err != nil {
				t.Fatal(err)
			}
			s.index.Files["a"] = Vector{Path: path, SHA256: ceremony.Digest(data), Count: count, G2: g2}
			if g2 {
				points, err := s.LoadG2("a", count)
				if err == nil || points != nil {
					t.Fatalf("partial G2 returned: len=%d err=%v", len(points), err)
				}
			} else {
				points, err := s.LoadG1("a", count)
				if err == nil || points != nil {
					t.Fatalf("partial G1 returned: len=%d err=%v", len(points), err)
				}
			}
		})
	}
}

func TestCacheCallbackFailureReturnsNoPoints(t *testing.T) {
	for _, g2 := range []bool{false, true} {
		t.Run(map[bool]string{false: "G1", true: "G2"}[g2], func(t *testing.T) {
			c, _, body, _ := fixture(t, 3, 0)
			s := store(t, c, body, "", "", nil)
			_, _, g1Point, g2Point := curve.Generators()
			var err error
			if g2 {
				err = s.SaveG2("a", []curve.G2Affine{g2Point})
			} else {
				err = s.SaveG1("a", []curve.G1Affine{g1Point})
			}
			if err != nil {
				t.Fatal(err)
			}
			s.emit = func(string) error { return io.ErrClosedPipe }
			if g2 {
				points, err := s.LoadG2("a", 1)
				if err == nil || points != nil {
					t.Fatal("G2 escaped after failed checkpoint")
				}
			} else {
				points, err := s.LoadG1("a", 1)
				if err == nil || points != nil {
					t.Fatal("G1 escaped after failed checkpoint")
				}
			}
		})
	}
}

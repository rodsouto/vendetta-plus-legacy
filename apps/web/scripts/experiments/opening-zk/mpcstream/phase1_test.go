package mpcstream

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"strings"
	"testing"

	curve "github.com/consensys/gnark-crypto/ecc/bn254"
	native "github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	"vendetta-opening-pairing-experiment/mpcinspect"
)

func encoded(t *testing.T, w io.WriterTo) []byte {
	t.Helper()
	var b bytes.Buffer
	if _, err := w.WriteTo(&b); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}
func digest(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }
func shape(n uint64) mpcinspect.Shape {
	return mpcinspect.Shape{Schema: "vendetta-hidden-v2-native-shape-1", CircuitSHA256: strings.Repeat("a", 64), Phase: 1, Domain: n, PrivateCommitted: []uint64{}}
}
func TestInitialAnchorMatchesNative(t *testing.T) {
	for _, n := range []uint64{2, 8, 16, 1024} {
		anchor, err := InitialAnchor(n)
		if err != nil {
			t.Fatal(err)
		}
		if anchor.SHA256 != digest(encoded(t, native.NewPhase1(n))) {
			t.Fatal("initial encoding differs")
		}
	}
	for n, pin := range map[uint64]string{1 << 22: "cb693c7407deadfb05cf3f33282583444a2ce10e7250ecf87b0ac0b255b05b22", 1 << 23: "1e109a72796c380a84a193b644ac652790a6a4223a06783a6dc710b00a94a93c"} {
		anchor, err := InitialAnchor(n)
		if err != nil || anchor.SHA256 != pin {
			t.Fatal("actual measured initial state differs", err)
		}
	}
}
func TestCompactVerifierMatchesNative(t *testing.T) {
	for _, n := range []uint64{8, 16} {
		previous := native.NewPhase1(n)
		p := native.NewPhase1(n)
		anchor, err := InitialAnchor(n)
		if err != nil {
			t.Fatal(err)
		}
		for range 2 {
			p.Contribute()
			raw := encoded(t, p)
			pin := digest(raw)
			decoded := new(native.Phase1)
			if _, err := decoded.ReadFrom(bytes.NewReader(raw)); err != nil {
				t.Fatal(err)
			}
			if err := previous.Verify(decoded); err != nil {
				t.Fatal(err)
			}
			commons, next, err := VerifyTransition(bytes.NewReader(raw), shape(n), pin, anchor, 1<<20, 1<<20)
			if err != nil {
				t.Fatal(err)
			}
			if next.SHA256 != pin || uint64(len(commons.G2.Tau)) != n {
				t.Fatal("compact state differs")
			}
			// Read the same native contribution again, including canonical framing.
			parts, err := read(bytes.NewReader(raw), shape(n), pin, 1<<20, 1<<20)
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(encoded(t, parts), raw) {
				t.Fatal("native serialization differs")
			}
			anchor = next
			previous = decoded
		}
	}
}
func TestCompactVerifierRejectsSubstitution(t *testing.T) {
	p := native.NewPhase1(8)
	p.Contribute()
	raw := encoded(t, p)
	anchor, _ := InitialAnchor(8)
	for name, mutate := range map[string]func(*Anchor){
		"domain":       func(a *Anchor) { a.Domain = 16 },
		"digest":       func(a *Anchor) { a.SHA256 = strings.Repeat("0", 64) },
		"alpha":        func(a *Anchor) { _, _, g1, _ := curve.Generators(); g1.Double(&g1); a.AlphaG1 = g1hex(g1) },
		"noncanonical": func(a *Anchor) { a.BetaG2 = strings.ToUpper(a.BetaG2) },
	} {
		t.Run(name, func(t *testing.T) {
			a := anchor
			mutate(&a)
			if _, _, err := VerifyTransition(bytes.NewReader(raw), shape(8), digest(raw), a, 1<<20, 1<<20); err == nil {
				t.Fatal("bad anchor accepted")
			}
		})
	}
	parts, err := read(bytes.NewReader(raw), shape(8), digest(raw), 1<<20, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	_, _, generator, _ := curve.Generators()
	parts.commons.G1.Tau[3] = generator
	bad := encoded(t, parts)
	if _, _, err := VerifyTransition(bytes.NewReader(bad), shape(8), digest(bad), anchor, 1<<20, 1<<20); err == nil {
		t.Fatal("invalid powers-of-tau ratio accepted")
	}
	for _, data := range [][]byte{raw[:len(raw)-1], append(append([]byte{}, raw...), 0)} {
		if _, _, err := VerifyTransition(bytes.NewReader(data), shape(8), digest(data), anchor, 1<<20, 1<<20); err == nil {
			t.Fatal("incomplete/trailing input accepted")
		}
	}
}

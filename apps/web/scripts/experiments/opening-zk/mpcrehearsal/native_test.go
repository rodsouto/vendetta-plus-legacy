package mpcrehearsal

import (
	"bytes"
	"encoding/binary"
	"testing"

	"github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	"vendetta-opening-pairing-experiment/ceremony"
	"vendetta-opening-pairing-experiment/mpcinspect"
)

func TestNativePreflight(t *testing.T) {
	ccs, n, err := compile()
	if err != nil {
		t.Fatal(err)
	}
	p1 := mpcsetup.NewPhase1(n)
	p1.Contribute()
	raw1, err := encodeNative(p1)
	if err != nil {
		t.Fatal(err)
	}
	if err := preflight1(raw1, n); err != nil {
		t.Fatal(err)
	}
	circuit, err := encodeNative(ccs)
	if err != nil {
		t.Fatal(err)
	}
	decoded1, err := mpcinspect.Decode(bytes.NewReader(raw1), nativeShape(ceremony.Digest(circuit), n, nil), ceremony.Digest(raw1), MaxNativeBytes, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	fresh := decoded1.Phase1
	commons, err := mpcsetup.VerifyPhase1(n, []byte("test-only"), fresh)
	if err != nil {
		t.Fatal(err)
	}
	p2 := new(mpcsetup.Phase2)
	p2.Initialize(ccs, &commons)
	p2.Contribute()
	raw2, err := encodeNative(p2)
	if err != nil {
		t.Fatal(err)
	}
	if err := preflight2(raw2, p2); err != nil {
		t.Fatal(err)
	}
	if _, err := mpcinspect.Decode(bytes.NewReader(raw2), nativeShape(ceremony.Digest(circuit), n, p2), ceremony.Digest(raw2), MaxNativeBytes, 1<<20); err != nil {
		t.Fatal(err)
	}
	for name, mutate := range map[string]func([]byte){
		"domain-bomb":     func(b []byte) { binary.BigEndian.PutUint64(b[288:296], ^uint64(0)) },
		"uncompressed":    func(b []byte) { b[0] &= 0x3f },
		"empty-challenge": func(b []byte) { b[len(b)-33] = 0 },
	} {
		t.Run("phase1/"+name, func(t *testing.T) {
			b := append([]byte{}, raw1...)
			mutate(b)
			if err := preflight1(b, n); err == nil {
				t.Fatal("unsafe native input accepted")
			}
		})
	}
	for name, mutate := range map[string]func([]byte){
		"commitment-count-bomb": func(b []byte) { binary.BigEndian.PutUint16(b[:2], 65535) },
		"private-vector-bomb":   func(b []byte) { binary.BigEndian.PutUint32(b[34:38], ^uint32(0)) },
		"z-vector-bomb": func(b []byte) {
			offset := 38 + len(p2.Parameters.G1.PKK)*32
			binary.BigEndian.PutUint32(b[offset:offset+4], ^uint32(0))
		},
		"sigma-vector-bomb": func(b []byte) {
			offset := 38 + len(p2.Parameters.G1.PKK)*32 + 4 + len(p2.Parameters.G1.Z)*32 + 64
			binary.BigEndian.PutUint32(b[offset:offset+4], ^uint32(0))
		},
		"uncompressed":    func(b []byte) { b[2] &= 0x3f },
		"empty-challenge": func(b []byte) { b[len(b)-33] = 0 },
	} {
		t.Run("phase2/"+name, func(t *testing.T) {
			b := append([]byte{}, raw2...)
			mutate(b)
			if err := preflight2(b, p2); err == nil {
				t.Fatal("unsafe native input accepted")
			}
		})
	}
	for i, raw := range [][]byte{raw1, raw2} {
		check := func(b []byte) error {
			if i == 0 {
				return preflight1(b, n)
			}
			return preflight2(b, p2)
		}
		for cut := 0; cut < len(raw); cut++ {
			if err := check(raw[:cut]); err == nil {
				t.Fatalf("truncated phase %d at %d accepted", i+1, cut)
			}
		}
		if err := check(append(append([]byte{}, raw...), 0)); err == nil {
			t.Fatal("trailing data accepted")
		}
	}
}

func TestArchivedBeaconAuthentication(t *testing.T) {
	for _, b := range archivedBeacons() {
		if _, err := authenticateBeacon(b); err != nil {
			t.Fatal(err)
		}
	}
	b := archivedBeacons()[0]
	b.Round++
	if _, err := authenticateBeacon(b); err == nil {
		t.Fatal("substituted round accepted")
	}
	b = archivedBeacons()[0]
	b.Signature = "c" + b.Signature[1:]
	if _, err := authenticateBeacon(b); err == nil {
		t.Fatal("substituted signature accepted")
	}
	b = archivedBeacons()[0]
	b.ChainHash = zeroHash
	if _, err := authenticateBeacon(b); err == nil {
		t.Fatal("substituted chain accepted")
	}
}

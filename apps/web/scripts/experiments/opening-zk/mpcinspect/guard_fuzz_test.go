package mpcinspect

import (
	"bytes"
	"encoding/json"
	"io"
	"testing"

	"vendetta-opening-pairing-experiment/ceremony"
)

// Compare the existing scan grammar with the forwarding guard under independent
// mutations of dimensional policy and native bytes. Native allocation is not
// invoked by the fuzzer; both readers have a 64 KiB input ceiling.
func FuzzGuardMatchesScan(f *testing.F) {
	for _, count := range []int{0, 1, 2} {
		s1, r1, s2, r2 := fixtures(f, count)
		for i, shape := range []Shape{s1, s2} {
			policy, err := json.Marshal(shape)
			if err != nil {
				f.Fatal(err)
			}
			f.Add(policy, [][]byte{r1, r2}[i])
		}
	}
	f.Fuzz(func(t *testing.T, policy, raw []byte) {
		if len(policy) > 64*1024 || len(raw) > 64*1024 {
			return
		}
		shape, err := ParseShape(policy, ceremony.Digest(policy))
		if err != nil {
			return
		}
		pin := ceremony.Digest(raw)
		_, scanErr := Scan(bytes.NewReader(raw), shape, pin, 64*1024)
		guard, guardErr := NewGuard(bytes.NewReader(raw), shape, pin, 64*1024)
		if guardErr == nil {
			_, guardErr = io.Copy(io.Discard, guard)
			if guardErr == nil {
				guardErr = guard.Finish()
			}
		}
		if (scanErr == nil) != (guardErr == nil) {
			t.Fatalf("guard/scan grammar differs: scan=%v guard=%v", scanErr, guardErr)
		}
	})
}

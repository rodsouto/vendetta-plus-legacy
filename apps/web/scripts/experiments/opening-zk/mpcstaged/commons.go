package mpcstaged

import (
	"encoding/binary"
	"errors"
	"io"

	curve "github.com/consensys/gnark-crypto/ecc/bn254"
	"vendetta-opening-pairing-experiment/mpcinspect"
)

// Read only one vector, but stream and authenticate the entire sealed commons.
// Selected points use the native checked decoder; framing and SHA bind the rest.
func readPowers(r io.Reader, n uint64, pin, kind string) ([]curve.G1Affine, []curve.G2Affine, error) {
	g, err := mpcinspect.NewCommonsGuard(r, n, pin, 2<<30)
	if err != nil {
		return nil, nil, err
	}
	var domain uint64
	if err = binary.Read(g, binary.BigEndian, &domain); err != nil {
		return nil, nil, err
	}
	if domain != n {
		return nil, nil, errors.New("commons domain differs")
	}
	if _, err = io.CopyN(io.Discard, g, 64); err != nil {
		return nil, nil, err
	}
	_, _, g1, g2 := curve.Generators()
	var first []curve.G1Affine
	var second []curve.G2Affine
	dec := curve.NewDecoder(g)
	for _, v := range []struct {
		name  string
		count uint64
		g2    bool
	}{
		{"tau1", 2*n - 2, false}, {"tau2", n - 1, true}, {"beta", n, false}, {"alpha", n, false},
	} {
		if v.name != kind {
			size := int64(32)
			if v.g2 {
				size = 64
			}
			if _, err = io.CopyN(io.Discard, g, int64(v.count)*size); err != nil {
				return nil, nil, err
			}
			continue
		}
		offset := 0
		count := int(v.count)
		if kind == "tau1" || kind == "tau2" {
			offset = 1
			count++
		}
		if v.g2 {
			second = make([]curve.G2Affine, count)
			second[0] = g2
			for i := offset; i < count; i++ {
				if err = dec.Decode(&second[i]); err != nil {
					return nil, nil, err
				}
			}
		} else {
			first = make([]curve.G1Affine, count)
			if offset == 1 {
				first[0] = g1
			}
			for i := offset; i < count; i++ {
				if err = dec.Decode(&first[i]); err != nil {
					return nil, nil, err
				}
			}
		}
	}
	if err = g.Finish(); err != nil {
		return nil, nil, err
	}
	if first == nil && second == nil {
		return nil, nil, errors.New("unknown powers vector")
	}
	return first, second, nil
}

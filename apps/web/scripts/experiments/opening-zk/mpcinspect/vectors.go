package mpcinspect

import (
	"bufio"
	"crypto/sha256"
	"errors"
	"io"
)

const EvaluationMagic uint64 = 0x56444556414c3031 // VDEVAL01, local cache format
type Vector struct {
	Count uint64
	G2    bool
}

// NewEvaluationGuard protects a local cache of phase-2 evaluations. Dimensions
// must come from the compiled CS; the marker is not a native gnark file format.
func NewEvaluationGuard(r io.Reader, vectors []Vector, commitments uint64, pin string, maxWire uint64) (*Guard, error) {
	if commitments > 255 || len(vectors) != int(commitments)+4 || !validPin(pin) {
		return nil, errors.New("invalid evaluation shape")
	}
	size := uint64(10)
	for _, v := range vectors {
		if v.Count > maxPrivate {
			return nil, errors.New("evaluation vector exceeds bound")
		}
		point := uint64(32)
		if v.G2 {
			point = 64
		}
		size += 4 + v.Count*point
		if size > MaxTranscriptBytes {
			return nil, errors.New("evaluation cache exceeds ceiling")
		}
	}
	if maxWire == 0 || maxWire > MaxTranscriptBytes || size > maxWire {
		return nil, errors.New("evaluation cache exceeds wire budget")
	}
	g := &Guard{r: bufio.NewReaderSize(io.LimitReader(r, int64(size)+1), 64*1024), h: sha256.New(), pin: pin, expected: size}
	g.steps = append(g.steps, step{size: 8, count: 1, kind: integerToken, expected: EvaluationMagic}, step{size: 2, count: 1, kind: integerToken, expected: commitments})
	for _, v := range vectors {
		g.steps = append(g.steps, step{size: 4, count: 1, kind: integerToken, expected: v.Count})
		if v.Count > 0 {
			point := 32
			if v.G2 {
				point = 64
			}
			g.steps = append(g.steps, step{size: point, count: v.Count, kind: pointToken})
		}
	}
	return g, nil
}

func EvaluationWireSize(vectors []Vector) (uint64, error) {
	size := uint64(10)
	if len(vectors) < 4 || len(vectors) > 259 {
		return 0, errors.New("evaluation vector count outside bound")
	}
	for _, v := range vectors {
		if v.Count > maxPrivate {
			return 0, errors.New("evaluation count outside bound")
		}
		point := uint64(32)
		if v.G2 {
			point = 64
		}
		size += 4 + point*v.Count
		if size > MaxTranscriptBytes {
			return 0, errors.New("evaluation bytes outside bound")
		}
	}
	return size, nil
}

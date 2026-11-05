package mpcinspect

import (
	"bufio"
	"crypto/sha256"
	"errors"
	"io"
)

// NewCommonsGuard validates the sealed native SrsCommons grammar. It has no
// contribution proof or challenge; the caller must authenticate its seal receipt.
func NewCommonsGuard(r io.Reader, n uint64, pin string, maxWire uint64) (*Guard, error) {
	if n < 2 || n > MaxDomain || n&(n-1) != 0 {
		return nil, errors.New("invalid sealed commons domain")
	}
	size := 192*n - 56
	if !validPin(pin) || maxWire == 0 || maxWire > MaxTranscriptBytes || size > maxWire {
		return nil, errors.New("sealed commons pin/budget differs")
	}
	g := &Guard{r: bufio.NewReaderSize(io.LimitReader(r, int64(size)+1), 64*1024), h: sha256.New(), pin: pin, expected: size}
	g.steps = []step{{size: 8, count: 1, kind: integerToken, expected: n}, {size: 64, count: 1, kind: pointToken}, {size: 32, count: 2*n - 2, kind: pointToken}, {size: 64, count: n - 1, kind: pointToken}, {size: 32, count: 2 * n, kind: pointToken}}
	return g, nil
}

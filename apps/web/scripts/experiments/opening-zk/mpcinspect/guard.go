package mpcinspect

import (
	"bufio"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"hash"
	"io"
)

type tokenKind byte

const (
	rawToken tokenKind = iota
	pointToken
	integerToken
)

type step struct {
	size     int
	count    uint64
	kind     tokenKind
	expected uint64
}

// Guard forwards a token only after its allocation-driving value or compressed
// tag has been checked. Unlike a preflight followed by reopening a file, native
// decoding consumes these same checked bytes. Call Finish after ReadFrom.
type Guard struct {
	r              io.Reader
	steps          []step
	index          int
	left           uint64
	buf            [64]byte
	offset, length int
	h              hash.Hash
	pin            string
	bytes          uint64
	expected       uint64
	err            error
	verified       bool
}

func NewGuard(r io.Reader, shape Shape, pin string, maxBytes uint64) (*Guard, error) {
	return newStateGuard(r, shape, pin, maxBytes, false)
}

// NewInitialPhase2Guard is only for a locally generated, pinned initialization
// cache. Its empty challenge must never be accepted as a contribution.
func NewInitialPhase2Guard(r io.Reader, shape Shape, pin string, maxBytes uint64) (*Guard, error) {
	if shape.Phase != 2 {
		return nil, errors.New("initial cache must be phase two")
	}
	return newStateGuard(r, shape, pin, maxBytes, true)
}
func newStateGuard(r io.Reader, shape Shape, pin string, maxBytes uint64, initial bool) (*Guard, error) {
	size, err := shape.Size()
	if err != nil {
		return nil, err
	}
	if initial {
		size -= 32
	}
	if !validPin(pin) || maxBytes == 0 || maxBytes > MaxTranscriptBytes || size > maxBytes {
		return nil, errors.New("invalid guarded transcript pin or byte budget")
	}
	g := &Guard{r: bufio.NewReaderSize(io.LimitReader(r, int64(size)+1), 64*1024), h: sha256.New(), pin: pin, expected: size}
	points := func(n uint64, size int) {
		if n > 0 {
			g.steps = append(g.steps, step{size: size, count: n, kind: pointToken})
		}
	}
	integer := func(size int, n uint64) {
		g.steps = append(g.steps, step{size: size, count: 1, kind: integerToken, expected: n})
	}
	proof := func() { points(1, 32); points(1, 64) }
	vector := func(n uint64) { integer(4, n); points(n, 32) }
	if shape.Phase == 1 {
		for range 3 {
			proof()
		}
		integer(8, shape.Domain)
		points(1, 64)
		points(2*shape.Domain-2, 32)
		points(shape.Domain-1, 64)
		points(2*shape.Domain, 32)
	} else {
		integer(2, uint64(len(shape.PrivateCommitted)))
		points(1, 32)
		vector(shape.Private)
		vector(shape.Domain - 1)
		points(1, 64)
		for _, n := range shape.PrivateCommitted {
			vector(n)
		}
		points(uint64(len(shape.PrivateCommitted)), 64)
		for i := 0; i <= len(shape.PrivateCommitted); i++ {
			proof()
		}
	}
	if initial {
		integer(1, 0)
	} else {
		integer(1, 32)
		g.steps = append(g.steps, step{size: 32, count: 1, kind: rawToken})
	}
	return g, nil
}

func (g *Guard) Read(p []byte) (int, error) {
	if len(p) == 0 {
		return 0, nil
	}
	if g.err != nil {
		return 0, g.err
	}
	if g.offset == g.length {
		if g.left == 0 {
			if g.index == len(g.steps) {
				var extra [1]byte
				_, err := io.ReadFull(g.r, extra[:])
				if err != io.EOF {
					if err == nil {
						err = errors.New("trailing guarded transcript bytes")
					}
					g.err = err
					return 0, err
				}
				if g.bytes != g.expected || hex.EncodeToString(g.h.Sum(nil)) != g.pin {
					g.err = errors.New("guarded transcript digest/length differs")
					return 0, g.err
				}
				g.verified = true
				g.err = io.EOF
				return 0, io.EOF
			}
			g.left = g.steps[g.index].count
			g.index++
		}
		s := g.steps[g.index-1]
		if _, err := io.ReadFull(g.r, g.buf[:s.size]); err != nil {
			g.err = err
			return 0, err
		}
		if s.kind == pointToken && g.buf[0]&0xc0 == 0 {
			g.err = errors.New("uncompressed guarded native point")
			return 0, g.err
		}
		if s.kind == integerToken {
			var value uint64
			switch s.size {
			case 1:
				value = uint64(g.buf[0])
			case 2:
				value = uint64(binary.BigEndian.Uint16(g.buf[:2]))
			case 4:
				value = uint64(binary.BigEndian.Uint32(g.buf[:4]))
			case 8:
				value = binary.BigEndian.Uint64(g.buf[:8])
			}
			if value != s.expected {
				g.err = errors.New("guarded native length differs from pinned shape")
				return 0, g.err
			}
		}
		g.h.Write(g.buf[:s.size])
		g.offset = 0
		g.length = s.size
		g.left--
	}
	n := copy(p, g.buf[g.offset:g.length])
	g.offset += n
	g.bytes += uint64(n)
	return n, nil
}

func (g *Guard) Finish() error {
	if g.verified {
		return nil
	}
	var b [1]byte
	n, err := g.Read(b[:])
	if n == 0 && err == io.EOF && g.verified {
		return nil
	}
	if err != nil {
		return err
	}
	g.err = errors.New("native consumer left transcript bytes unread")
	return g.err
}

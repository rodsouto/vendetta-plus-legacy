// Package artifactcheck checks bounded local artifact relations, never setup provenance.
package artifactcheck

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"io"

	native "github.com/consensys/gnark/backend/groth16/bn254"
)

const MaxVKBytes = 64 << 10
const MaxSolidityBytes = 1 << 20
const MaxPublicInputs = 256

// The pinned Solidity exporter only supports zero or one commitment.
const maxCommitments = 1

// Result covers VK -> Solidity only. It does not authenticate a circuit, key
// derivation, ceremony, compilation, runtime or independent approval.
type Result struct {
	Status                      string `json:"status"`
	VKSHA256                    string `json:"vkSha256"`
	SoliditySHA256              string `json:"soliditySha256"`
	PublicInputs                int    `json:"publicInputs"`
	Commitments                 int    `json:"commitments"`
	VKPointsValidated           bool   `json:"vkPointsValidated"`
	VKCanonical                 bool   `json:"vkCanonical"`
	SolidityExportMatches       bool   `json:"solidityExportMatches"`
	CircuitBindingVerified      bool   `json:"circuitBindingVerified"`
	ProvingKeyRelationVerified  bool   `json:"provingKeyRelationVerified"`
	MPCTranscriptsVerified      bool   `json:"mpcTranscriptsVerified"`
	IndependentApprovalVerified bool   `json:"independentApprovalVerified"`
	ProductionApproved          bool   `json:"productionApproved"`
}

func validPin(pin string) bool {
	if len(pin) != 64 {
		return false
	}
	b, err := hex.DecodeString(pin)
	return err == nil && len(b) == 32 && hex.EncodeToString(b) == pin
}

type cursor struct {
	data []byte
	at   int
}

func (c *cursor) take(n int) ([]byte, error) {
	if n < 0 || n > len(c.data)-c.at {
		return nil, io.ErrUnexpectedEOF
	}
	b := c.data[c.at : c.at+n]
	c.at += n
	return b, nil
}
func (c *cursor) integer(size int) (uint64, error) {
	b, err := c.take(size)
	if err != nil {
		return 0, err
	}
	if size == 4 {
		return uint64(binary.BigEndian.Uint32(b)), nil
	}
	return binary.BigEndian.Uint64(b), nil
}
func (c *cursor) points(count, size int) error {
	for range count {
		b, err := c.take(size)
		if err != nil {
			return err
		}
		// The pinned native compressed format uses 01 for infinity, 10/11 for
		// finite points. 00 would let the decoder consume an uncompressed point.
		if b[0]&0xc0 == 0 {
			return errors.New("uncompressed VK point rejected")
		}
	}
	return nil
}

// framing checks every allocation prefix BEFORE native ReadFrom. The decoder
// subsequently consumes the same private byte slice, never a reopened file.
func framing(data []byte, public int) (int, error) {
	c := cursor{data: data}
	for _, size := range []int{32, 32, 64, 64, 32, 64} {
		if err := c.points(1, size); err != nil {
			return 0, err
		}
	}
	k, err := c.integer(4)
	if err != nil {
		return 0, err
	}
	if k < uint64(public+1) || k > uint64(public+1+maxCommitments) {
		return 0, errors.New("VK public vector count differs")
	}
	if err = c.points(int(k), 32); err != nil {
		return 0, err
	}
	count, err := c.integer(4)
	if err != nil {
		return 0, err
	}
	if count > maxCommitments || k != uint64(public+1)+count {
		return 0, errors.New("VK commitment count differs")
	}
	for i := 0; i < int(count); i++ {
		length, err := c.integer(4)
		if err != nil {
			return 0, err
		}
		if length > uint64(public+i) {
			return 0, errors.New("VK committed input count exceeds bound")
		}
		var previous uint64
		for j := 0; j < int(length); j++ {
			index, err := c.integer(8)
			if err != nil {
				return 0, err
			}
			// Translated wire 0 is the constant; only inputs and preceding
			// commitment wires can be committed in the Solidity verifier.
			if index == 0 || index > uint64(public+i) || (j > 0 && index <= previous) {
				return 0, errors.New("VK committed input index invalid")
			}
			previous = index
		}
	}
	keys, err := c.integer(4)
	if err != nil {
		return 0, err
	}
	if keys != count {
		return 0, errors.New("VK commitment key count differs")
	}
	if err = c.points(int(keys)*2, 64); err != nil {
		return 0, err
	}
	if c.at != len(data) {
		return 0, errors.New("VK trailing bytes")
	}
	return int(count), nil
}

type limitedWriter struct {
	writer    io.Writer
	remaining int
}

func (w *limitedWriter) Write(data []byte) (int, error) {
	if len(data) > w.remaining {
		return 0, errors.New("Solidity export exceeds byte budget")
	}
	n, err := w.writer.Write(data)
	w.remaining -= n
	return n, err
}

// CheckVKSolidity never returns a usable native key, including on error. Inputs
// are copied after the size checks; callers must not mutate them concurrently
// during that copy. Native points/subgroups and byte-for-byte canonical encoding
// are checked before exporting. Public is supplied by a trusted caller, not the VK.
func CheckVKSolidity(data []byte, vkPin string, solidity []byte, solidityPin string, public int) (*Result, error) {
	if len(data) == 0 || len(data) > MaxVKBytes || len(solidity) == 0 || len(solidity) > MaxSolidityBytes || public < 0 || public > MaxPublicInputs || !validPin(vkPin) || !validPin(solidityPin) {
		return nil, errors.New("invalid VK/export input, pin or budget")
	}
	data = bytes.Clone(data)
	solidity = bytes.Clone(solidity)
	h := sha256.Sum256(data)
	s := sha256.Sum256(solidity)
	if hex.EncodeToString(h[:]) != vkPin || hex.EncodeToString(s[:]) != solidityPin {
		return nil, errors.New("VK/export pin differs")
	}
	vk, count, err := checkedVK(data, vkPin, public)
	if err != nil {
		return nil, err
	}
	exported := sha256.New()
	bounded := limitedWriter{writer: exported, remaining: MaxSolidityBytes}
	if err = vk.ExportSolidity(&bounded); err != nil {
		return nil, err
	}
	if MaxSolidityBytes-bounded.remaining != len(solidity) || hex.EncodeToString(exported.Sum(nil)) != solidityPin {
		return nil, errors.New("VK Solidity export differs")
	}
	return &Result{Status: "vk-solidity-export-verified", VKSHA256: vkPin, SoliditySHA256: solidityPin, PublicInputs: public, Commitments: count, VKPointsValidated: true, VKCanonical: true, SolidityExportMatches: true}, nil
}

func checkedVK(data []byte, pin string, public int) (*native.VerifyingKey, int, error) {
	if len(data) == 0 || len(data) > MaxVKBytes || public < 0 || public > MaxPublicInputs || !validPin(pin) {
		return nil, 0, errors.New("invalid VK input or dimension")
	}
	data = bytes.Clone(data)
	sum := sha256.Sum256(data)
	if hex.EncodeToString(sum[:]) != pin {
		return nil, 0, errors.New("VK pin differs")
	}
	vkPin := pin
	count, err := framing(data, public)
	if err != nil {
		return nil, 0, err
	}
	vk := new(native.VerifyingKey)
	r := bytes.NewReader(data)
	n, err := vk.ReadFrom(r)
	if err != nil {
		return nil, 0, err
	}
	if n != int64(len(data)) || r.Len() != 0 {
		return nil, 0, errors.New("native VK consumption differs")
	}
	canonical := sha256.New()
	n, err = vk.WriteTo(canonical)
	if err != nil {
		return nil, 0, err
	}
	if n != int64(len(data)) || hex.EncodeToString(canonical.Sum(nil)) != vkPin {
		return nil, 0, errors.New("noncanonical VK bytes")
	}
	return vk, count, nil
}

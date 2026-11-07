package artifactcheck

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"hash"
	"io"

	curve "github.com/consensys/gnark-crypto/ecc/bn254"
	"github.com/consensys/gnark-crypto/ecc/bn254/fr/fft"
	"vendetta-opening-pairing-experiment/ceremony"
)

const MaxPKBytes uint64 = 2 << 30
const maxWires uint64 = 1 << 25

// MaxPKValidationPoints deliberately restricts native point validation to small
// exports. Game-domain scans remain framing-only until a separately reviewed
// per-operation budget/supervisor is available.
const MaxPKValidationPoints uint64 = 65536

// CompiledMetadata is a pinned compile report, not a native CS or independent
// authentication of the report's declared circuit digest.
type CompiledMetadata struct {
	Schema                string               `json:"schema"`
	Kind                  string               `json:"kind"`
	SHA256                string               `json:"sha256"`
	Bytes                 uint64               `json:"bytes"`
	Constraints           uint64               `json:"constraints"`
	Domain                uint64               `json:"domain"`
	InternalVariables     uint64               `json:"internalVariables"`
	SecretVariables       uint64               `json:"secretVariables"`
	PublicInputs          uint64               `json:"publicInputs"`
	Commitments           []CompiledCommitment `json:"commitments"`
	GameDomainMPCMeasured bool                 `json:"gameDomainMpcMeasured"`
	Phase2Measured        bool                 `json:"phase2Measured"`
	ProductionApproved    bool                 `json:"productionApproved"`
}
type CompiledCommitment struct {
	CommitmentIndex              uint64 `json:"commitmentIndex"`
	PrivateCommitted             uint64 `json:"privateCommitted"`
	PublicAndCommitmentCommitted uint64 `json:"publicAndCommitmentCommitted"`
	PublicCommitted              uint64 `json:"publicCommitted"`
}

func (m CompiledMetadata) dimensions() (uint64, uint64, error) {
	if m.Schema != "vendetta-hidden-v2-compiled-cs-1" || !validPin(m.SHA256) || m.Bytes == 0 || m.Bytes > 400<<20 || m.Domain < 2 || m.Domain > 1<<23 || m.Domain&(m.Domain-1) != 0 || m.Constraints == 0 || m.Constraints > m.Domain || (m.Domain > 2 && m.Constraints <= m.Domain/2) || m.PublicInputs > MaxPublicInputs || m.InternalVariables > maxWires || m.SecretVariables > maxWires || len(m.Commitments) > maxCommitments || m.Commitments == nil {
		return 0, 0, errors.New("compiled metadata dimensions exceed bounds")
	}
	wires := m.InternalVariables + m.SecretVariables + m.PublicInputs + 1
	if wires > maxWires {
		return 0, 0, errors.New("compiled wire total exceeds bound")
	}
	committed := uint64(len(m.Commitments))
	previous := uint64(0)
	for i, c := range m.Commitments {
		if c.PrivateCommitted > maxWires || c.CommitmentIndex <= m.PublicInputs || c.CommitmentIndex >= wires || (i > 0 && c.CommitmentIndex <= previous) || c.PublicCommitted > m.PublicInputs || c.PublicAndCommitmentCommitted < c.PublicCommitted || c.PublicAndCommitmentCommitted > m.PublicInputs+uint64(i) {
			return 0, 0, errors.New("compiled commitment metadata differs")
		}
		committed += c.PrivateCommitted
		previous = c.CommitmentIndex
	}
	private := m.InternalVariables + m.SecretVariables
	if committed > private {
		return 0, 0, errors.New("compiled private total differs")
	}
	return wires, private - committed, nil
}
func ParseCompiledMetadata(data []byte, pin, csPin string) (CompiledMetadata, error) {
	var m CompiledMetadata
	if len(data) > 65536 || !validPin(pin) || !validPin(csPin) || ceremony.Digest(data) != pin {
		return m, errors.New("compiled metadata pin differs")
	}
	if err := ceremony.DecodeDocument(data, &m); err != nil {
		return m, err
	}
	if m.SHA256 != csPin {
		return m, errors.New("declared CS identity differs")
	}
	_, _, err := m.dimensions()
	return m, err
}

type PKResult struct {
	Status                        string `json:"status"`
	PKSHA256                      string `json:"pkSha256"`
	VKSHA256                      string `json:"vkSha256"`
	DeclaredCircuitSHA256         string `json:"declaredCircuitSha256"`
	BytesRead                     uint64 `json:"bytesRead"`
	Domain                        uint64 `json:"domain"`
	Wires                         uint64 `json:"wires"`
	DimensionsMatchPinnedMetadata bool   `json:"dimensionsMatchPinnedMetadata"`
	SharedParametersMatchVK       bool   `json:"sharedParametersMatchVk"`
	VKPointsValidated             bool   `json:"vkPointsValidated"`
	AllPKPointsValidated          bool   `json:"allPkPointsValidated"`
	CircuitBindingVerified        bool   `json:"circuitBindingVerified"`
	FullKeyRelationVerified       bool   `json:"fullKeyRelationVerified"`
	MPCTranscriptsVerified        bool   `json:"mpcTranscriptsVerified"`
	ProductionApproved            bool   `json:"productionApproved"`
}
type pkReader struct {
	r              *bufio.Reader
	h              hash.Hash
	read, max      uint64
	buffer         [65536]byte
	validatePoints bool
}

func (p *pkReader) take(n uint64) ([]byte, error) {
	if n > uint64(len(p.buffer)) || n > p.max-p.read {
		return nil, errors.New("PK read exceeds budget")
	}
	b := p.buffer[:n]
	got, err := io.ReadFull(p.r, b)
	p.h.Write(b[:got])
	p.read += uint64(got)
	return b, err
}
func (p *pkReader) number(n uint64) (uint64, error) {
	b, err := p.take(n)
	if err != nil {
		return 0, err
	}
	if n == 4 {
		return uint64(binary.BigEndian.Uint32(b)), nil
	}
	return binary.BigEndian.Uint64(b), nil
}
func (p *pkReader) vector(size uint64, expected uint64, exact, compact bool) (uint64, error) {
	count, err := p.number(4)
	if err != nil {
		return 0, err
	}
	if (exact && count != expected) || count > expected || count > (p.max-p.read)/size {
		return 0, errors.New("PK vector count exceeds shape or budget")
	}
	left := count
	for left > 0 {
		n := min(left, uint64(len(p.buffer))/size)
		b, err := p.take(n * size)
		if err != nil {
			return 0, err
		}
		for offset := uint64(0); offset < uint64(len(b)); offset += size {
			tag := b[offset] & 0xc0
			if tag == 0 || (compact && tag == 0x40) {
				return 0, errors.New("PK vector point tag differs")
			}
			if p.validatePoints {
				if err := validatePoint(b[offset:offset+size], size); err != nil {
					return 0, err
				}
			}
		}
		left -= n
	}
	return count, nil
}
func (p *pkReader) mask(wires, expected uint64) error {
	var ones uint64
	for left := wires; left > 0; {
		n := min(left, uint64(len(p.buffer)))
		b, err := p.take(n)
		if err != nil {
			return err
		}
		for _, v := range b {
			if v > 1 {
				return errors.New("PK mask is noncanonical")
			}
			ones += uint64(v)
		}
		left -= n
	}
	if ones != expected {
		return errors.New("PK infinity mask count differs")
	}
	return nil
}

// CheckPKStructure never invokes the native PK or FFT domain deserializer. It
// validates framing/dimensions/masks and compares five shared header points to
// a bounded, checked VK. Other PK points are only tag-scanned, not curve-checked.
func CheckPKStructure(r io.Reader, pkPin string, vkData []byte, vkPin string, m CompiledMetadata, maxBytes uint64) (*PKResult, error) {
	return checkPK(r, pkPin, vkData, vkPin, m, maxBytes, false, 0)
}

// CheckPKPoints adds native checked point/subgroup decoding and canonical
// reserialization without accumulating vectors. A conservative total PK-point
// bound must fit maxPoints before any PK bytes or VK points are decoded.
// This is not proof of the CS/key equations or safe setup provenance.
func CheckPKPoints(r io.Reader, pkPin string, vkData []byte, vkPin string, m CompiledMetadata, maxBytes, maxPoints uint64) (*PKResult, error) {
	return checkPK(r, pkPin, vkData, vkPin, m, maxBytes, true, maxPoints)
}

func validatePoint(data []byte, size uint64) error {
	r := bytes.NewReader(data)
	decoder := curve.NewDecoder(r)
	if size == 32 {
		var point curve.G1Affine
		if err := decoder.Decode(&point); err != nil {
			return err
		}
		canonical := point.Bytes()
		if r.Len() != 0 || !bytes.Equal(data, canonical[:]) {
			return errors.New("PK G1 point is noncanonical")
		}
	} else {
		var point curve.G2Affine
		if err := decoder.Decode(&point); err != nil {
			return err
		}
		canonical := point.Bytes()
		if r.Len() != 0 || !bytes.Equal(data, canonical[:]) {
			return errors.New("PK G2 point is noncanonical")
		}
	}
	return nil
}

func checkPK(r io.Reader, pkPin string, vkData []byte, vkPin string, m CompiledMetadata, maxBytes uint64, validate bool, maxPoints uint64) (*PKResult, error) {
	wires, private, err := m.dimensions()
	if err != nil {
		return nil, err
	}
	if !validPin(pkPin) || maxBytes == 0 || maxBytes > MaxPKBytes {
		return nil, errors.New("invalid PK pin or budget")
	}
	if validate {
		// Every compact A/B/G2.B vector has at most one point per wire;
		// count the remaining vectors exactly and the five shared header points.
		bound := 3*wires + m.Domain - 1 + private + 5
		for _, c := range m.Commitments {
			bound += 2 * c.PrivateCommitted
		}
		if maxPoints == 0 || maxPoints > MaxPKValidationPoints || bound > maxPoints {
			return nil, errors.New("PK native point validation exceeds small-export budget")
		}
	}
	vk, count, err := checkedVK(vkData, vkPin, int(m.PublicInputs))
	if err != nil {
		return nil, err
	}
	if count != len(m.Commitments) {
		return nil, errors.New("VK commitment dimension differs")
	}
	for i, c := range m.Commitments {
		if uint64(len(vk.PublicAndCommitmentCommitted[i])) != c.PublicAndCommitmentCommitted {
			return nil, errors.New("VK committed input dimension differs")
		}
	}
	p := pkReader{r: bufio.NewReaderSize(io.LimitReader(r, int64(maxBytes)+1), 65536), h: sha256.New(), max: maxBytes, validatePoints: validate}
	domain, err := p.take(169)
	if err != nil {
		return nil, err
	}
	// WithoutPrecompute computes only constant-size domain metadata, never FFT
	// tables. Compare field encodings while permitting either canonical bool flag.
	reference := fft.NewDomain(m.Domain, fft.WithoutPrecompute())
	var encoded bytes.Buffer
	if _, err = reference.WriteTo(&encoded); err != nil {
		return nil, err
	}
	if !bytes.Equal(domain[:168], encoded.Bytes()[:168]) || domain[168] > 1 {
		return nil, errors.New("PK domain metadata differs")
	}
	alpha, beta, delta := vk.G1.Alpha.Bytes(), vk.G1.Beta.Bytes(), vk.G1.Delta.Bytes()
	for _, expected := range [][]byte{alpha[:], beta[:], delta[:]} {
		b, e := p.take(32)
		if e != nil {
			return nil, e
		}
		if !bytes.Equal(b, expected) {
			return nil, errors.New("PK/VK G1 parameter differs")
		}
	}
	a, err := p.vector(32, wires, false, true)
	if err != nil {
		return nil, err
	}
	b, err := p.vector(32, wires, false, true)
	if err != nil {
		return nil, err
	}
	if _, err = p.vector(32, m.Domain-1, true, false); err != nil {
		return nil, err
	}
	if _, err = p.vector(32, private, true, false); err != nil {
		return nil, err
	}
	beta2, delta2 := vk.G2.Beta.Bytes(), vk.G2.Delta.Bytes()
	for _, expected := range [][]byte{beta2[:], delta2[:]} {
		data, e := p.take(64)
		if e != nil {
			return nil, e
		}
		if !bytes.Equal(data, expected) {
			return nil, errors.New("PK/VK G2 parameter differs")
		}
	}
	if _, err = p.vector(64, b, true, true); err != nil {
		return nil, err
	}
	encodedWires, err := p.number(8)
	if err != nil {
		return nil, err
	}
	if encodedWires != wires {
		return nil, errors.New("PK wire count differs")
	}
	infA, err := p.number(8)
	if err != nil {
		return nil, err
	}
	infB, err := p.number(8)
	if err != nil {
		return nil, err
	}
	if infA != wires-a || infB != wires-b {
		return nil, errors.New("PK infinity counters differ")
	}
	if err = p.mask(wires, infA); err != nil {
		return nil, err
	}
	if err = p.mask(wires, infB); err != nil {
		return nil, err
	}
	keys, err := p.number(4)
	if err != nil {
		return nil, err
	}
	if keys != uint64(len(m.Commitments)) {
		return nil, errors.New("PK commitment key count differs")
	}
	for _, c := range m.Commitments {
		for range 2 {
			if _, err = p.vector(32, c.PrivateCommitted, true, false); err != nil {
				return nil, err
			}
		}
	}
	if _, err = p.r.ReadByte(); err != io.EOF {
		return nil, errors.New("PK trailing bytes or missing EOF")
	}
	if hex.EncodeToString(p.h.Sum(nil)) != pkPin {
		return nil, errors.New("PK SHA-256 differs")
	}
	status := "pk-structure-and-shared-parameters-verified"
	if validate {
		status = "pk-points-structure-and-shared-parameters-verified"
	}
	return &PKResult{Status: status, PKSHA256: pkPin, VKSHA256: vkPin, DeclaredCircuitSHA256: m.SHA256, BytesRead: p.read, Domain: m.Domain, Wires: wires, DimensionsMatchPinnedMetadata: true, SharedParametersMatchVK: true, VKPointsValidated: true, AllPKPointsValidated: validate}, nil
}

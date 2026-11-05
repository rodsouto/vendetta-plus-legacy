package mpcrehearsal

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	cs "github.com/consensys/gnark/constraint/bn254"
	"vendetta-opening-pairing-experiment/ceremony"
	"vendetta-opening-pairing-experiment/mpcinspect"
)

const contributionDomain = "VENDETTA_HIDDEN_V2_MPC_REHEARSAL_CONTRIBUTION_V1\n"
const zeroHash = "0000000000000000000000000000000000000000000000000000000000000000"

type Config struct {
	Schema        string              `json:"schema"`
	RunID         string              `json:"runId"`
	CircuitSHA256 string              `json:"circuitSha256"`
	DomainSize    uint64              `json:"domainSize"`
	Participants  []ceremony.Reviewer `json:"participants"`
	Beacons       []Beacon            `json:"archivedTestBeacons"`
}
type Statement struct {
	Schema                 string `json:"schema"`
	RunID                  string `json:"runId"`
	ConfigSHA256           string `json:"configSha256"`
	CircuitSHA256          string `json:"circuitSha256"`
	Phase                  int    `json:"phase"`
	Index                  int    `json:"index"`
	ParticipantID          string `json:"participantId"`
	Phase1ClosureSHA256    string `json:"phase1ClosureSha256"`
	PreviousArtifactSHA256 string `json:"previousArtifactSha256"`
	PreviousNativeSHA256   string `json:"previousNativeSha256"`
	NativeSHA256           string `json:"nativeSha256"`
}
type Artifact struct {
	Payload    string `json:"payload"`
	Signature  string `json:"signature"`
	Transcript string `json:"transcript"`
}
type Closure struct {
	Schema              string   `json:"schema"`
	ConfigSHA256        string   `json:"configSha256"`
	Phase               int      `json:"phase"`
	Phase1ClosureSHA256 string   `json:"phase1ClosureSha256"`
	ArtifactSHA256      []string `json:"artifactSha256"`
}
type identity struct {
	Seed string `json:"seed"`
}
type context struct {
	config Config
	pin    string
	dir    string
	ccs    *cs.R1CS
	n      uint64
	beacon [][]byte
	parent string
	shapes [2]mpcinspect.Shape
}

func marshal(v any) ([]byte, error) { return json.Marshal(v) }
func artifactName(phase, index int) string {
	return fmt.Sprintf("phase-%d-contribution-%d.json", phase, index)
}
func closureName(phase int) string { return fmt.Sprintf("phase-%d-closure.json", phase) }

// Initialize creates ephemeral test identities. All are controlled by this one
// operator; no participant independence or secure entropy erasure is claimed.
func Initialize(dir string) (string, error) {
	if err := externalDirectory(dir); err != nil {
		return "", err
	}
	if err := os.Mkdir(dir, 0700); err != nil {
		return "", err
	}
	ccs, n, err := compile()
	if err != nil {
		return "", err
	}
	raw, err := encodeNative(ccs)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	cfg := Config{Schema: "vendetta-hidden-v2-unsafe-small-mpc-rehearsal-1", RunID: hex.EncodeToString(nonce), CircuitSHA256: ceremony.Digest(raw), DomainSize: n, Beacons: archivedBeacons()}
	for _, id := range []string{"participant-a", "participant-b"} {
		pub, key, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			return "", err
		}
		cfg.Participants = append(cfg.Participants, ceremony.Reviewer{ID: id, PublicKey: hex.EncodeToString(pub)})
		b, err := marshal(identity{hex.EncodeToString(key.Seed())})
		if err != nil {
			return "", err
		}
		if err := writeFile(filepath.Join(dir, id+"-test-identity.json"), b); err != nil {
			return "", err
		}
	}
	b, err := marshal(cfg)
	if err != nil {
		return "", err
	}
	if err := writeFile(filepath.Join(dir, "config.json"), b); err != nil {
		return "", err
	}
	return ceremony.Digest(b), nil
}
func load(dir, pin, parent string) (*context, error) {
	data, err := readFile(filepath.Join(dir, "config.json"))
	if err != nil {
		return nil, err
	}
	if ceremony.Digest(data) != pin {
		return nil, errors.New("configuration does not match external pin")
	}
	var cfg Config
	if err := ceremony.DecodeDocument(data, &cfg); err != nil {
		return nil, err
	}
	if cfg.Schema != "vendetta-hidden-v2-unsafe-small-mpc-rehearsal-1" || len(cfg.RunID) != 32 || len(cfg.Participants) != 2 || len(cfg.Beacons) != 2 {
		return nil, errors.New("unsupported rehearsal configuration")
	}
	nonce, err := hex.DecodeString(cfg.RunID)
	if err != nil || hex.EncodeToString(nonce) != cfg.RunID {
		return nil, errors.New("invalid rehearsal run id")
	}
	for i, id := range []string{"participant-a", "participant-b"} {
		if cfg.Participants[i].ID != id {
			return nil, errors.New("unexpected participant order")
		}
		if _, err := ceremony.ParsePublicKey(cfg.Participants[i].PublicKey); err != nil {
			return nil, err
		}
	}
	if cfg.Participants[0].PublicKey == cfg.Participants[1].PublicKey {
		return nil, errors.New("duplicate participant keys")
	}
	ccs, n, err := compile()
	if err != nil {
		return nil, err
	}
	raw, err := encodeNative(ccs)
	if err != nil {
		return nil, err
	}
	if cfg.DomainSize != n || cfg.CircuitSHA256 != ceremony.Digest(raw) {
		return nil, errors.New("fixed rehearsal circuit/domain mismatch")
	}
	ctx := &context{config: cfg, pin: pin, dir: dir, ccs: ccs, n: n, parent: parent}
	for i := range ctx.shapes {
		ctx.shapes[i], err = mpcinspect.ShapeFromCS(ccs, cfg.CircuitSHA256, uint64(i+1))
		if err != nil {
			return nil, err
		}
	}
	// Only the two explicitly archived fixtures are supported. This cannot be
	// mistaken for a live ceremony with a future beacon or an arbitrary CS.
	for i, b := range cfg.Beacons {
		if b != archivedBeacons()[i] {
			return nil, errors.New("rehearsal requires the pinned archived beacon fixtures")
		}
		challenge, err := authenticateBeacon(b)
		if err != nil {
			return nil, err
		}
		ctx.beacon = append(ctx.beacon, challenge)
	}
	return ctx, nil
}
func canonicalBase64(text string) ([]byte, error) {
	data, err := base64.StdEncoding.Strict().DecodeString(text)
	if err != nil || base64.StdEncoding.EncodeToString(data) != text {
		return nil, errors.New("noncanonical base64")
	}
	return data, nil
}
func (c *context) statement(phase, index int, prevArtifact string, prevNative, data []byte) Statement {
	parent := zeroHash
	if phase == 2 {
		parent = c.parent
	}
	return Statement{"vendetta-hidden-v2-rehearsal-contribution-1", c.config.RunID, c.pin, c.config.CircuitSHA256, phase, index, c.config.Participants[index].ID, parent, prevArtifact, ceremony.Digest(prevNative), ceremony.Digest(data)}
}
func (c *context) readArtifact(phase, index int, prevArtifact string, prevNative []byte) ([]byte, string, error) {
	raw, err := readFile(filepath.Join(c.dir, artifactName(phase, index)))
	if err != nil {
		return nil, "", err
	}
	var a Artifact
	if err := ceremony.DecodeDocument(raw, &a); err != nil {
		return nil, "", err
	}
	payload, err := canonicalBase64(a.Payload)
	if err != nil {
		return nil, "", err
	}
	var statement Statement
	if err := ceremony.DecodeDocument(payload, &statement); err != nil {
		return nil, "", err
	}
	data, err := canonicalBase64(a.Transcript)
	if err != nil || len(data) > MaxNativeBytes {
		return nil, "", errors.New("invalid native transcript encoding/size")
	}
	expected := c.statement(phase, index, prevArtifact, prevNative, data)
	if statement != expected {
		return nil, "", errors.New("contribution statement does not match expected chain/context")
	}
	sig, err := hex.DecodeString(a.Signature)
	if err != nil || len(sig) != 64 || hex.EncodeToString(sig) != a.Signature {
		return nil, "", errors.New("invalid attestation encoding")
	}
	pub, err := ceremony.ParsePublicKey(c.config.Participants[index].PublicKey)
	if err != nil {
		return nil, "", err
	}
	if !ed25519.Verify(pub, append([]byte(contributionDomain), payload...), sig) {
		return nil, "", errors.New("invalid contribution attestation")
	}
	return data, ceremony.Digest(raw), nil
}
func (c *context) phase1(count int) ([]*mpcsetup.Phase1, []string, error) {
	prev := mpcsetup.NewPhase1(c.n)
	hash := zeroHash
	var out []*mpcsetup.Phase1
	var hashes []string
	for i := 0; i < count; i++ {
		raw, err := encodeNative(prev)
		if err != nil {
			return nil, nil, err
		}
		data, nextHash, err := c.readArtifact(1, i, hash, raw)
		if err != nil {
			return nil, nil, err
		}
		if err := preflight1(data, c.n); err != nil {
			return nil, nil, err
		}
		decoded, err := mpcinspect.Decode(bytes.NewReader(data), c.shapes[0], ceremony.Digest(data), MaxNativeBytes, 1<<20)
		if err != nil {
			return nil, nil, err
		}
		next := decoded.Phase1
		if err := prev.Verify(next); err != nil {
			return nil, nil, err
		}
		out = append(out, next)
		hashes = append(hashes, nextHash)
		prev = next
		hash = nextHash
	}
	return out, hashes, nil
}
func (c *context) checkClosure(phase int, pin string, hashes []string) error {
	raw, err := readFile(filepath.Join(c.dir, closureName(phase)))
	if err != nil {
		return err
	}
	if ceremony.Digest(raw) != pin {
		return errors.New("closure does not match external pin")
	}
	var cl Closure
	if err := ceremony.DecodeDocument(raw, &cl); err != nil {
		return err
	}
	parent := zeroHash
	if phase == 2 {
		parent = c.parent
	}
	if cl.Schema != "vendetta-hidden-v2-rehearsal-closure-1" || cl.ConfigSHA256 != c.pin || cl.Phase != phase || cl.Phase1ClosureSHA256 != parent || len(cl.ArtifactSHA256) != 2 || len(hashes) != 2 {
		return errors.New("incomplete or cross-context closure")
	}
	for i := range hashes {
		if hashes[i] != cl.ArtifactSHA256[i] {
			return errors.New("closure omits, reorders or substitutes contributions")
		}
	}
	return nil
}
func (c *context) commons() (mpcsetup.SrsCommons, error) {
	list, hashes, err := c.phase1(2)
	if err != nil {
		return mpcsetup.SrsCommons{}, err
	}
	if err := c.checkClosure(1, c.parent, hashes); err != nil {
		return mpcsetup.SrsCommons{}, err
	}
	return mpcsetup.VerifyPhase1(c.n, c.beacon[0], list...)
}
func (c *context) phase2(count int) ([]*mpcsetup.Phase2, []string, mpcsetup.SrsCommons, error) {
	commons, err := c.commons()
	if err != nil {
		return nil, nil, commons, err
	}
	prev := new(mpcsetup.Phase2)
	prev.Initialize(c.ccs, &commons)
	var out []*mpcsetup.Phase2
	var hashes []string
	hash := zeroHash
	for i := 0; i < count; i++ {
		raw, err := encodeNative(prev)
		if err != nil {
			return nil, nil, commons, err
		}
		data, nextHash, err := c.readArtifact(2, i, hash, raw)
		if err != nil {
			return nil, nil, commons, err
		}
		if err := preflight2(data, prev); err != nil {
			return nil, nil, commons, err
		}
		decoded, err := mpcinspect.Decode(bytes.NewReader(data), c.shapes[1], ceremony.Digest(data), MaxNativeBytes, 1<<20)
		if err != nil {
			return nil, nil, commons, err
		}
		next := decoded.Phase2
		if err := prev.Verify(next); err != nil {
			return nil, nil, commons, err
		}
		out = append(out, next)
		hashes = append(hashes, nextHash)
		prev = next
		hash = nextHash
	}
	return out, hashes, commons, nil
}

func Contribute(dir, pin, parent, keyPath string, phase, index int) error {
	if (phase != 1 && phase != 2) || index < 0 || index >= 2 {
		return errors.New("invalid rehearsal phase/index")
	}
	c, err := load(dir, pin, parent)
	if err != nil {
		return err
	}
	var prevNative, nextNative []byte
	prevArtifact := zeroHash
	if phase == 1 {
		list, hashes, err := c.phase1(index)
		if err != nil {
			return err
		}
		prev := mpcsetup.NewPhase1(c.n)
		if index > 0 {
			prev = list[index-1]
			prevArtifact = hashes[index-1]
		}
		prevNative, err = encodeNative(prev)
		if err != nil {
			return err
		}
		prev.Contribute()
		nextNative, err = encodeNative(prev)
		if err != nil {
			return err
		}
	} else {
		list, hashes, commons, err := c.phase2(index)
		if err != nil {
			return err
		}
		prev := new(mpcsetup.Phase2)
		prev.Initialize(c.ccs, &commons)
		if index > 0 {
			prev = list[index-1]
			prevArtifact = hashes[index-1]
		}
		prevNative, err = encodeNative(prev)
		if err != nil {
			return err
		}
		prev.Contribute()
		nextNative, err = encodeNative(prev)
		if err != nil {
			return err
		}
	}
	keyData, err := readFile(keyPath)
	if err != nil {
		return err
	}
	var id identity
	if err := ceremony.DecodeDocument(keyData, &id); err != nil {
		return err
	}
	seed, err := hex.DecodeString(id.Seed)
	if err != nil || len(seed) != 32 || hex.EncodeToString(seed) != id.Seed {
		return errors.New("invalid test identity seed")
	}
	key := ed25519.NewKeyFromSeed(seed)
	if hex.EncodeToString(key.Public().(ed25519.PublicKey)) != c.config.Participants[index].PublicKey {
		return errors.New("test signer does not match participant")
	}
	payload, err := marshal(c.statement(phase, index, prevArtifact, prevNative, nextNative))
	if err != nil {
		return err
	}
	signature := ed25519.Sign(key, append([]byte(contributionDomain), payload...))
	artifact := Artifact{base64.StdEncoding.EncodeToString(payload), hex.EncodeToString(signature), base64.StdEncoding.EncodeToString(nextNative)}
	raw, err := marshal(artifact)
	if err != nil {
		return err
	}
	return writeFile(filepath.Join(dir, artifactName(phase, index)), raw)
}
func Close(dir, pin, parent string, phase int) (string, error) {
	c, err := load(dir, pin, parent)
	if err != nil {
		return "", err
	}
	var hashes []string
	if phase == 1 {
		_, hashes, err = c.phase1(2)
	} else if phase == 2 {
		_, hashes, _, err = c.phase2(2)
	} else {
		return "", errors.New("invalid phase")
	}
	if err != nil {
		return "", err
	}
	p := zeroHash
	if phase == 2 {
		p = parent
	}
	raw, err := marshal(Closure{"vendetta-hidden-v2-rehearsal-closure-1", pin, phase, p, hashes})
	if err != nil {
		return "", err
	}
	if err := writeFile(filepath.Join(dir, closureName(phase)), raw); err != nil {
		return "", err
	}
	return ceremony.Digest(raw), nil
}

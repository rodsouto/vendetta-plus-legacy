// Unsafe local capacity cache. All files are public, exclusive, context-bound and pinned.
package mpcstaged

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"syscall"

	curve "github.com/consensys/gnark-crypto/ecc/bn254"
	"vendetta-opening-pairing-experiment/ceremony"
)

const Algorithm = "vendetta-unsafe-local-staged-phase2-1"

type Vector struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	Count  uint64 `json:"count"`
	G2     bool   `json:"g2"`
}
type Index struct {
	Schema             string            `json:"schema"`
	CSHash             string            `json:"csHash"`
	CommonsHash        string            `json:"commonsHash"`
	Domain             uint64            `json:"domain"`
	Files              map[string]Vector `json:"files"`
	ProductionApproved bool              `json:"productionApproved"`
}
type Store struct {
	dir    string
	index  Index
	emit   func(string) error
	layout *Layout
}

func NewStore(dir, csPin, commonsPin string, n uint64, resume, resumePin string, emit func(string) error) (*Store, error) {
	if !filepath.IsAbs(dir) || len(csPin) != 64 || len(commonsPin) != 64 || n < 2 || n > 1<<23 || n&(n-1) != 0 {
		return nil, errors.New("invalid staged cache context")
	}
	if err := os.Mkdir(dir, 0700); err != nil {
		return nil, err
	}
	s := &Store{dir: dir, index: Index{Schema: Algorithm, CSHash: csPin, CommonsHash: commonsPin, Domain: n, Files: make(map[string]Vector)}, emit: emit}
	if (resume == "") != (resumePin == "") {
		return nil, errors.New("cache resume requires metadata and pin")
	}
	if resume != "" {
		f, err := regular(resume)
		if err != nil {
			return nil, err
		}
		defer f.Close()
		b, err := ceremony.BoundRead(f)
		if err != nil {
			return nil, err
		}
		if ceremony.Digest(b) != resumePin {
			return nil, errors.New("cache index pin differs")
		}
		var previous Index
		if err = ceremony.DecodeDocument(b, &previous); err != nil {
			return nil, err
		}
		if previous.Schema != Algorithm || previous.CSHash != csPin || previous.CommonsHash != commonsPin || previous.Domain != n || previous.ProductionApproved || previous.Files == nil || len(previous.Files) > 16 {
			return nil, errors.New("cache index context differs")
		}
		for name, v := range previous.Files {
			if !validName(name) || !filepath.IsAbs(v.Path) || len(v.SHA256) != 64 || v.Count == 0 || v.Count > 1<<25 {
				return nil, errors.New("invalid cached vector metadata")
			}
			s.index.Files[name] = v
		}
	}
	return s, nil
}
func validName(name string) bool {
	switch name {
	case "z", "a", "b", "c", "k-alpha", "k", "g2-b", "lagrange-tau1", "lagrange-tau2", "lagrange-alpha", "lagrange-beta":
		return true
	}
	return false
}
func regular(path string) (*os.File, error) {
	// Check the opened descriptor; a preceding Lstat leaves a replacement window
	// in which Open could follow a symlink or block indefinitely on a FIFO.
	f, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0)
	if err != nil {
		return nil, err
	}
	info, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, err
	}
	if !info.Mode().IsRegular() {
		f.Close()
		return nil, errors.New("regular cache file required")
	}
	return f, nil
}
func (s *Store) Has(name string) bool { _, ok := s.index.Files[name]; return ok }
func (s *Store) emitStage(stage string) error {
	if s.emit != nil {
		return s.emit(stage)
	}
	return nil
}
func (s *Store) save(name string, count int, g2 bool, points any) error {
	if !validName(name) || s.Has(name) {
		return errors.New("cache vector already exists or unknown")
	}
	path := filepath.Join(s.dir, name+".bin")
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	h := sha256.New()
	w := bufio.NewWriterSize(io.MultiWriter(f, h), 1<<20)
	err = curve.NewEncoder(w).Encode(points)
	if err == nil {
		err = w.Flush()
	}
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	s.index.Files[name] = Vector{Path: path, SHA256: hex.EncodeToString(h.Sum(nil)), Count: uint64(count), G2: g2}
	b, err := json.MarshalIndent(s.index, "", "  ")
	if err != nil {
		return err
	}
	b = append(b, '\n')
	receipt := filepath.Join(s.dir, fmt.Sprintf("index-%02d.json", len(s.index.Files)))
	out, err := os.OpenFile(receipt, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	_, err = out.Write(b)
	if err == nil {
		err = out.Sync()
	}
	closeErr = out.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	directory, err := os.Open(s.dir)
	if err != nil {
		return err
	}
	defer directory.Close()
	if err = directory.Sync(); err != nil {
		return err
	}
	return s.emitStage("cache-persisted-" + name + " index=" + receipt + " sha256=" + ceremony.Digest(b))
}
func (s *Store) SaveG1(name string, p []curve.G1Affine) error { return s.save(name, len(p), false, &p) }
func (s *Store) SaveG2(name string, p []curve.G2Affine) error { return s.save(name, len(p), true, &p) }
func (s *Store) load(name string, count int, g2 bool, points any) error {
	v, ok := s.index.Files[name]
	if !ok || v.Count != uint64(count) || v.G2 != g2 {
		return errors.New("cache vector shape differs")
	}
	f, err := regular(v.Path)
	if err != nil {
		return err
	}
	defer f.Close()
	size := int64(32)
	if g2 {
		size = 64
	}
	stat, err := f.Stat()
	if err != nil {
		return err
	}
	if stat.Size() != 4+size*int64(count) {
		return errors.New("cache vector size differs")
	}
	// Authenticate the bounded vector and check its native length before decoding.
	h := sha256.New()
	if _, err = io.Copy(h, f); err != nil {
		return err
	}
	if hex.EncodeToString(h.Sum(nil)) != v.SHA256 {
		return errors.New("cache vector digest differs")
	}
	if _, err = f.Seek(0, io.SeekStart); err != nil {
		return err
	}
	var encodedCount uint32
	if err = binary.Read(f, binary.BigEndian, &encodedCount); err != nil {
		return err
	}
	if uint64(encodedCount) != v.Count {
		return errors.New("cache vector length differs")
	}
	// Use the already checked count, never a second mutable allocation header.
	var header [4]byte
	binary.BigEndian.PutUint32(header[:], encodedCount)
	h.Reset()
	bounded := io.MultiReader(bytes.NewReader(header[:]), io.LimitReader(f, size*int64(count)))
	if err = curve.NewDecoder(io.TeeReader(bounded, h)).Decode(points); err != nil {
		return err
	}
	var extra [1]byte
	if n, e := f.Read(extra[:]); n != 0 || e != io.EOF {
		return errors.New("cache vector trailing data")
	}
	if !strings.EqualFold(hex.EncodeToString(h.Sum(nil)), v.SHA256) {
		return errors.New("cache vector changed during decode")
	}
	return s.emitStage("cache-loaded-" + name)
}
func (s *Store) LoadG1(name string, count int) ([]curve.G1Affine, error) {
	var p []curve.G1Affine
	if err := s.load(name, count, false, &p); err != nil {
		return nil, err
	}
	return p, nil
}
func (s *Store) LoadG2(name string, count int) ([]curve.G2Affine, error) {
	var p []curve.G2Affine
	if err := s.load(name, count, true, &p); err != nil {
		return nil, err
	}
	return p, nil
}

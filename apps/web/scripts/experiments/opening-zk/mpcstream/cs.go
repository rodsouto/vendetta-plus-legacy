package mpcstream

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"io"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/constraint"
	cs "github.com/consensys/gnark/constraint/bn254"
)

// ReadCompiledCS accepts only exact bytes named by a previously authenticated CS
// digest. It is not an importer for arbitrary caller-chosen/unreviewed CBOR.
// The immutable bounded copy prevents replacement between hashing and ReadFrom.
// Callers must also enforce kernel memory/CPU limits for native CBOR allocations.
func ReadCompiledCS(r io.Reader, pin string, maxBytes int64) (*cs.R1CS, error) {
	if maxBytes < 32 || maxBytes > 400<<20 || len(pin) != 64 {
		return nil, errors.New("invalid compiled CS budget/pin")
	}
	data, err := io.ReadAll(io.LimitReader(r, maxBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxBytes || len(data) < 32 {
		return nil, errors.New("compiled CS exceeds size bound")
	}
	h := sha256.Sum256(data)
	if hex.EncodeToString(h[:]) != pin {
		return nil, errors.New("compiled CS digest differs")
	}
	if binary.LittleEndian.Uint64(data[:8]) != uint64(len(data)-32) || binary.LittleEndian.Uint64(data[8:16]) != 0 || binary.LittleEndian.Uint64(data[16:24]) != 16 || binary.LittleEndian.Uint64(data[24:32]) != 4 {
		return nil, errors.New("compiled CS header differs from pinned backend")
	}
	compiled := groth16.NewCS(ecc.BN254).(*cs.R1CS)
	n, err := compiled.ReadFrom(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	if n != int64(len(data)) || compiled.Type != constraint.SystemR1CS || compiled.Field().Cmp(ecc.BN254.ScalarField()) != 0 {
		return nil, errors.New("compiled CS type/field/length differs")
	}
	return compiled, nil
}

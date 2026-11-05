package mpcstaged

import (
	"errors"

	curve "github.com/consensys/gnark-crypto/ecc/bn254"
	"github.com/consensys/gnark/backend/groth16"
	impl "github.com/consensys/gnark/backend/groth16/bn254"
	native "github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
)

// Seal preserves native beacon contribution and key construction, filtering the
// three wire vectors in place instead of allocating native temporary clones.
// The caller must relinquish evals: its A/B vectors no longer have wire order.
func Seal(p *native.Phase2, commons *native.SrsCommons, evals *native.Phase2Evaluations, beacon []byte) (groth16.ProvingKey, groth16.VerifyingKey, error) {
	n := len(evals.G1.A)
	if len(evals.G1.B) != n || len(evals.G2.B) != n {
		return nil, nil, errors.New("seal wire vector dimensions differ")
	}
	flagsA, flagsB := make([]bool, n), make([]bool, n)
	for i := range n {
		flagsA[i] = evals.G1.A[i].IsInfinity()
		flagsB[i] = evals.G1.B[i].IsInfinity()
		if flagsB[i] != evals.G2.B[i].IsInfinity() {
			return nil, nil, errors.New("G1/G2 B infinity masks differ")
		}
	}
	compactG1 := func(points []curve.G1Affine, flags []bool) []curve.G1Affine {
		j := 0
		for i, point := range points {
			if !flags[i] {
				points[j] = point
				j++
			}
		}
		return points[:j]
	}
	a, b := compactG1(evals.G1.A, flagsA), compactG1(evals.G1.B, flagsB)
	b2 := evals.G2.B
	j := 0
	for i, point := range b2 {
		if !flagsB[i] {
			b2[j] = point
			j++
		}
	}
	b2 = b2[:j]
	var minimal native.Phase2Evaluations
	minimal.G1.VKK = evals.G1.VKK
	minimal.G1.CKK = evals.G1.CKK
	minimal.PublicAndCommitmentCommitted = evals.PublicAndCommitmentCommitted
	// Native Seal hashes/updates p independently of the evaluation wire vectors.
	// Its remaining fields, commitment keys, domain and VK stay native.
	pk, vk := p.Seal(commons, &minimal, beacon)
	key, ok := pk.(*impl.ProvingKey)
	if !ok {
		return nil, nil, errors.New("unexpected native proving key type")
	}
	key.G1.A = a
	key.G1.B = b
	key.G2.B = b2
	key.InfinityA = flagsA
	key.InfinityB = flagsB
	key.NbInfinityA = uint64(n - len(a))
	key.NbInfinityB = uint64(n - len(b))
	evals.G1.A = nil
	evals.G1.B = nil
	evals.G2.B = nil
	return pk, vk, nil
}

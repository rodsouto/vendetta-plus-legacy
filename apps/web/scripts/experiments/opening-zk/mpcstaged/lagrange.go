// Copyright 2020-2026 Consensys Software Inc.
// Licensed under the Apache License, Version 2.0. See the LICENSE file for details.

// Adapted from gnark v0.16.4 backend/groth16/bn254/mpcsetup/lagrange.go.
// Original FFT arithmetic retained; coefficients are transformed in place and
// the local parallel loop replaces the inaccessible gnark/internal helper.

package mpcstaged

import (
	"math/big"
	"math/bits"
	"runtime"
	"sync"

	"github.com/consensys/gnark-crypto/ecc"
	curve "github.com/consensys/gnark-crypto/ecc/bn254"
	"github.com/consensys/gnark-crypto/ecc/bn254/fr"
	"github.com/consensys/gnark-crypto/ecc/bn254/fr/fft"
)

// TODO use gnark-crypto for this op
func lagrangeCoeffsG1(coeffs []curve.G1Affine) []curve.G1Affine {
	size := len(coeffs)
	domain, twiddlesInv := inverseDomain(size)
	numCPU := uint64(runtime.NumCPU())
	maxSplits := bits.TrailingZeros64(ecc.NextPowerOfTwo(numCPU))

	difFFTG1(coeffs, twiddlesInv, 0, maxSplits, nil)
	bitReverse(coeffs)

	var invBigint big.Int
	domain.CardinalityInv.BigInt(&invBigint)

	parallelize(size, func(start, end int) {
		for i := start; i < end; i++ {
			coeffs[i].ScalarMultiplication(&coeffs[i], &invBigint)
		}
	})
	return coeffs
}

// TODO use gnark-crypto for this op
func lagrangeCoeffsG2(coeffs []curve.G2Affine) []curve.G2Affine {
	size := len(coeffs)
	domain, twiddlesInv := inverseDomain(size)
	numCPU := uint64(runtime.NumCPU())
	maxSplits := bits.TrailingZeros64(ecc.NextPowerOfTwo(numCPU))

	difFFTG2(coeffs, twiddlesInv, 0, maxSplits, nil)
	bitReverse(coeffs)

	var invBigint big.Int
	domain.CardinalityInv.BigInt(&invBigint)

	parallelize(size, func(start, end int) {
		for i := start; i < end; i++ {
			coeffs[i].ScalarMultiplication(&coeffs[i], &invBigint)
		}
	})
	return coeffs
}

func butterflyG1(a *curve.G1Affine, b *curve.G1Affine) {
	t := *a
	a.Add(a, b)
	b.Sub(&t, b)
}

func butterflyG2(a *curve.G2Affine, b *curve.G2Affine) {
	t := *a
	a.Add(a, b)
	b.Sub(&t, b)
}

// kerDIF8 is a kernel that processes an FFT of size 8
func kerDIF8G1(a []curve.G1Affine, twiddles [][]fr.Element, stage int) {
	butterflyG1(&a[0], &a[4])
	butterflyG1(&a[1], &a[5])
	butterflyG1(&a[2], &a[6])
	butterflyG1(&a[3], &a[7])

	var twiddle big.Int
	twiddles[stage+0][1].BigInt(&twiddle)
	a[5].ScalarMultiplication(&a[5], &twiddle)
	twiddles[stage+0][2].BigInt(&twiddle)
	a[6].ScalarMultiplication(&a[6], &twiddle)
	twiddles[stage+0][3].BigInt(&twiddle)
	a[7].ScalarMultiplication(&a[7], &twiddle)
	butterflyG1(&a[0], &a[2])
	butterflyG1(&a[1], &a[3])
	butterflyG1(&a[4], &a[6])
	butterflyG1(&a[5], &a[7])
	twiddles[stage+1][1].BigInt(&twiddle)
	a[3].ScalarMultiplication(&a[3], &twiddle)
	a[7].ScalarMultiplication(&a[7], &twiddle)
	butterflyG1(&a[0], &a[1])
	butterflyG1(&a[2], &a[3])
	butterflyG1(&a[4], &a[5])
	butterflyG1(&a[6], &a[7])
}

// kerDIF8 is a kernel that processes an FFT of size 8
func kerDIF8G2(a []curve.G2Affine, twiddles [][]fr.Element, stage int) {
	butterflyG2(&a[0], &a[4])
	butterflyG2(&a[1], &a[5])
	butterflyG2(&a[2], &a[6])
	butterflyG2(&a[3], &a[7])

	var twiddle big.Int
	twiddles[stage+0][1].BigInt(&twiddle)
	a[5].ScalarMultiplication(&a[5], &twiddle)
	twiddles[stage+0][2].BigInt(&twiddle)
	a[6].ScalarMultiplication(&a[6], &twiddle)
	twiddles[stage+0][3].BigInt(&twiddle)
	a[7].ScalarMultiplication(&a[7], &twiddle)
	butterflyG2(&a[0], &a[2])
	butterflyG2(&a[1], &a[3])
	butterflyG2(&a[4], &a[6])
	butterflyG2(&a[5], &a[7])
	twiddles[stage+1][1].BigInt(&twiddle)
	a[3].ScalarMultiplication(&a[3], &twiddle)
	a[7].ScalarMultiplication(&a[7], &twiddle)
	butterflyG2(&a[0], &a[1])
	butterflyG2(&a[2], &a[3])
	butterflyG2(&a[4], &a[5])
	butterflyG2(&a[6], &a[7])
}

func difFFTG1(a []curve.G1Affine, twiddles [][]fr.Element, stage, maxSplits int, chDone chan struct{}) {
	if chDone != nil {
		defer close(chDone)
	}

	n := len(a)
	if n == 1 {
		return
	} else if n == 8 {
		kerDIF8G1(a, twiddles, stage)
		return
	}
	m := n >> 1

	butterflyG1(&a[0], &a[m])

	var twiddle big.Int
	for i := 1; i < m; i++ {
		butterflyG1(&a[i], &a[i+m])
		twiddles[stage][i].BigInt(&twiddle)
		a[i+m].ScalarMultiplication(&a[i+m], &twiddle)
	}

	if m == 1 {
		return
	}

	nextStage := stage + 1
	if stage < maxSplits {
		chDone := make(chan struct{}, 1)
		go difFFTG1(a[m:n], twiddles, nextStage, maxSplits, chDone)
		difFFTG1(a[0:m], twiddles, nextStage, maxSplits, nil)
		<-chDone
	} else {
		difFFTG1(a[0:m], twiddles, nextStage, maxSplits, nil)
		difFFTG1(a[m:n], twiddles, nextStage, maxSplits, nil)
	}
}
func difFFTG2(a []curve.G2Affine, twiddles [][]fr.Element, stage, maxSplits int, chDone chan struct{}) {
	if chDone != nil {
		defer close(chDone)
	}

	n := len(a)
	if n == 1 {
		return
	} else if n == 8 {
		kerDIF8G2(a, twiddles, stage)
		return
	}
	m := n >> 1

	butterflyG2(&a[0], &a[m])

	var twiddle big.Int
	for i := 1; i < m; i++ {
		butterflyG2(&a[i], &a[i+m])
		twiddles[stage][i].BigInt(&twiddle)
		a[i+m].ScalarMultiplication(&a[i+m], &twiddle)
	}

	if m == 1 {
		return
	}

	nextStage := stage + 1
	if stage < maxSplits {
		chDone := make(chan struct{}, 1)
		go difFFTG2(a[m:n], twiddles, nextStage, maxSplits, chDone)
		difFFTG2(a[0:m], twiddles, nextStage, maxSplits, nil)
		<-chDone
	} else {
		difFFTG2(a[0:m], twiddles, nextStage, maxSplits, nil)
		difFFTG2(a[m:n], twiddles, nextStage, maxSplits, nil)
	}
}

func bitReverse[T any](a []T) {
	n := uint64(len(a))
	nn := uint64(64 - bits.TrailingZeros64(n))

	for i := uint64(0); i < n; i++ {
		irev := bits.Reverse64(i) >> nn
		if irev > i {
			a[i], a[irev] = a[irev], a[i]
		}
	}
}

func parallelize(n int, work func(start, end int)) {
	tasks := min(runtime.GOMAXPROCS(0), n)
	var wait sync.WaitGroup
	for task := 0; task < tasks; task++ {
		start, end := n*task/tasks, n*(task+1)/tasks
		wait.Go(func() { work(start, end) })
	}
	wait.Wait()
}

// Match pinned fft.buildTwiddles exactly, retaining only inverse tables.
// fft.NewDomain normally also allocates forward twiddles and both coset tables;
// none of those three tables is read by this group inverse FFT.
func inverseDomain(size int) (*fft.Domain, [][]fr.Element) {
	domain := fft.NewDomain(uint64(size), fft.WithoutPrecompute())
	stages := bits.TrailingZeros64(uint64(size))
	tables := make([][]fr.Element, stages)
	if stages == 0 {
		return domain, tables
	}
	tables[0] = make([]fr.Element, 1+(1<<(stages-1)))
	fft.BuildExpTable(domain.GeneratorInv, tables[0])
	for stage := 1; stage < stages; stage++ {
		tables[stage] = make([]fr.Element, 1+(1<<(stages-stage-1)))
		for j := range tables[stage] {
			tables[stage][j] = tables[0][j<<stage]
		}
	}
	return domain, tables
}

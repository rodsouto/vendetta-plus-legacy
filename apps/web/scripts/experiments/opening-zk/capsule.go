// A bounded tlock KEM relation joined to the pairing. This is not the age/message circuit.
package main

import (
	"math/big"

	bls "github.com/consensys/gnark-crypto/ecc/bls12-381"
	"github.com/consensys/gnark/frontend"
	curve "github.com/consensys/gnark/std/algebra/emulated/sw_bls12381"
	"github.com/consensys/gnark/std/hash/sha2"
	"github.com/consensys/gnark/std/math/cmp"
	"github.com/consensys/gnark/std/math/emulated"
	"github.com/consensys/gnark/std/math/uints"
)

type CapsuleCircuit struct {
	Pair           PairCircuit
	SignatureBytes [48]uints.U8      `gnark:",public"`
	CapsuleBytes   [128]uints.U8     `gnark:",public"`
	FileKey        [16]uints.U8      `gnark:",public"`
	CapsuleValid   frontend.Variable `gnark:",public"`
	// If all candidates are rejected there is no witness, NOT a proof of invalidity.
	Attempts int `gnark:"-"`
}

func shaBytes(api frontend.API, parts ...[]uints.U8) []uints.U8 {
	h, err := sha2.New(api)
	if err != nil {
		panic(err)
	}
	for _, part := range parts {
		h.Write(part)
	}
	return h.Sum()
}

func constantBits(n *big.Int, length int) []frontend.Variable {
	out := make([]frontend.Variable, length)
	for i := range out {
		out[i] = n.Bit(i)
	}
	return out
}

func fieldBytes(api frontend.API, f *emulated.Field[curve.BaseField], u *uints.Bytes, x *emulated.Element[curve.BaseField]) []uints.U8 {
	bs := f.ToBitsCanonical(x)
	for len(bs) < 384 {
		bs = append(bs, 0)
	}
	out := make([]uints.U8, 48)
	for i := range out {
		out[47-i] = u.FromBits(bs[i*8 : (i+1)*8]...)
	}
	return out
}

func lexSign(api frontend.API, f *emulated.Field[curve.BaseField], x *emulated.Element[curve.BaseField]) frontend.Variable {
	var params curve.BaseField
	half := new(big.Int).Rsh(new(big.Int).Sub(params.Modulus(), big.NewInt(1)), 1)
	bs := f.ToBitsCanonical(x)
	return cmp.IsLessBinary(api, constantBits(half, len(bs)), bs)
}

func (c *CapsuleCircuit) Define(api frontend.API) error {
	return c.defineWithExternalH3(api, nil)
}

// external must be authenticated against a completed on-chain prefix before using the result.
func (c *CapsuleCircuit) defineWithExternalH3(api frontend.API, external *externalH3) error {
	if err := c.Pair.Define(api); err != nil {
		return err
	}
	f, err := emulated.NewField[curve.BaseField](api)
	if err != nil {
		return err
	}
	sf, err := emulated.NewField[curve.ScalarField](api)
	if err != nil {
		return err
	}
	u, err := uints.NewBytes(api)
	if err != nil {
		return err
	}
	// Bind the compressed encodings, including the sign bit and zero padding, to the points.
	sx := fieldBytes(api, f, u, &c.Pair.Signature.X)
	sx[0] = u.ValueOf(api.Add(u.Value(sx[0]), 128, api.Mul(32, lexSign(api, f, &c.Pair.Signature.Y))))
	for i := range sx {
		u.AssertIsEqual(sx[i], c.SignatureBytes[i])
	}
	ux := append(fieldBytes(api, f, u, &c.Pair.U.P.X.A1), fieldBytes(api, f, u, &c.Pair.U.P.X.A0)...)
	sign := api.Select(f.IsZero(&c.Pair.U.P.Y.A1), lexSign(api, f, &c.Pair.U.P.Y.A0), lexSign(api, f, &c.Pair.U.P.Y.A1))
	ux[0] = u.ValueOf(api.Add(u.Value(ux[0]), 128, api.Mul(32, sign)))
	for i := range ux {
		u.AssertIsEqual(ux[i], c.CapsuleBytes[i])
	}
	// ToTower returns the standard twelve Fp coefficients; tlock serializes them in reverse order.
	p, err := curve.NewPairing(api)
	if err != nil {
		return err
	}
	tower := p.ToTower(&c.Pair.GT)
	var serialized []uints.U8
	for i := len(tower) - 1; i >= 0; i-- {
		serialized = append(serialized, fieldBytes(api, f, u, tower[i])...)
	}
	pad := shaBytes(api, uints.NewU8Array([]byte("IBE-H2")), serialized)
	sigma := make([]uints.U8, 16)
	for i := range sigma {
		sigma[i] = u.Xor(c.CapsuleBytes[96+i], pad[i])
	}
	keyPad := shaBytes(api, uints.NewU8Array([]byte("IBE-H4")), sigma)
	for i := range c.FileKey {
		u.AssertIsEqual(c.FileKey[i], u.Xor(c.CapsuleBytes[112+i], keyPad[i]))
	}
	pre := shaBytes(api, uints.NewU8Array([]byte("IBE-H3")), sigma, c.FileKey[:])
	var scalar *emulated.Element[curve.ScalarField]
	if external != nil {
		for i := range pre {
			u.AssertIsEqual(pre[i], external.pre[i])
		}
		bits := make([]frontend.Variable, 0, 256)
		for i := 31; i >= 0; i-- {
			bits = append(bits, u.ToBits(external.scalar[i])...)
		}
		var params curve.ScalarField
		api.AssertIsEqual(cmp.IsLessBinary(api, bits, constantBits(params.Modulus(), 256)), 1)
		scalar = sf.FromBits(bits...)
	} else {
		attempts := c.Attempts
		if attempts == 0 {
			attempts = 4
		}
		if attempts < 1 || attempts > 65534 {
			panic("invalid rejection bound")
		}
		var params curve.ScalarField
		modulusBits := constantBits(params.Modulus(), 256)
		selected := make([]frontend.Variable, 256)
		for i := range selected {
			selected[i] = 0
		}
		var found frontend.Variable = 0
		for counter := 1; counter <= attempts; counter++ {
			candidate := shaBytes(api, uints.NewU8Array([]byte{byte(counter), byte(counter >> 8)}), pre)
			// tlock shifts the first byte right, rather than merely clearing its high bit.
			top := u.ToBits(candidate[0])
			candidate[0] = u.FromBits(append(top[1:], frontend.Variable(0))...)
			bits := make([]frontend.Variable, 0, 256)
			for j := 31; j >= 0; j-- {
				bits = append(bits, u.ToBits(candidate[j])...)
			}
			accepted := cmp.IsLessBinary(api, bits, modulusBits)
			choose := api.And(api.Sub(1, found), accepted)
			for j := range selected {
				selected[j] = api.Select(choose, bits[j], selected[j])
			}
			found = api.Or(found, accepted)
		}
		api.AssertIsEqual(found, 1)
		scalar = sf.FromBits(selected...)

	}
	g2, err := curve.NewG2(api)
	if err != nil {
		return err
	}
	_, _, _, gen := bls.Generators()
	generator := curve.NewG2Affine(gen)
	expected := g2.ScalarMul(&generator, scalar)
	api.AssertIsBoolean(c.CapsuleValid)
	api.AssertIsEqual(c.CapsuleValid, g2.IsEqual(expected, &c.Pair.U))
	return nil
}

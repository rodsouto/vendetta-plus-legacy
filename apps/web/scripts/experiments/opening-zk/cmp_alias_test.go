package main

import (
	"math/big"
	"strings"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/constraint/solver"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
	"github.com/consensys/gnark/std/math/bits"
	"github.com/consensys/gnark/std/math/cmp"
)

type comparisonAliasCircuit struct{ X, Result frontend.Variable }

func (c *comparisonAliasCircuit) Define(api frontend.API) error {
	api.AssertIsEqual(cmp.IsLessOrEqual(api, c.X, 10), c.Result)
	return nil
}

// A bounded regression for Claude's conditional comparator hypothesis. This
// compiles only a standalone comparison, never a game circuit, setup or proof.
func TestComparisonRejectsNoncanonicalHintAlias(t *testing.T) {
	field := ecc.BN254.ScalarField()
	c, err := frontend.Compile(field, r1cs.NewBuilder, &comparisonAliasCircuit{})
	if err != nil {
		t.Fatal(err)
	}
	honest, err := frontend.NewWitness(&comparisonAliasCircuit{X: 1, Result: 1}, field)
	if err != nil {
		t.Fatal(err)
	}
	if err := c.IsSolved(honest); err != nil {
		t.Fatal(err)
	}
	forged, err := frontend.NewWitness(&comparisonAliasCircuit{X: 1, Result: 0}, field)
	if err != nil {
		t.Fatal(err)
	}
	var selected solver.Hint
	for _, hint := range bits.GetHints() {
		if strings.HasSuffix(solver.GetHintName(hint), ".nBits") {
			selected = hint
		}
	}
	if selected == nil {
		t.Fatal("pinned binary decomposition hint not found")
	}
	called := false
	malicious := func(modulus *big.Int, inputs, outputs []*big.Int) error {
		called = true
		alias := new(big.Int).Add(inputs[0], modulus)
		for i := range outputs {
			outputs[i].SetUint64(uint64(alias.Bit(i)))
		}
		return nil
	}
	if err := c.IsSolved(forged, solver.OverrideHint(solver.GetHintID(selected), malicious)); err == nil {
		t.Fatal("noncanonical field alias changed comparison result")
	}
	if !called {
		t.Fatal("adversarial decomposition was not exercised")
	}
}

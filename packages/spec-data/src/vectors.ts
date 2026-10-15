// Test vectors (expected outputs), generated from docs/spec/data/test_vectors*.yaml. Tests only.
import testVectors from "../generated/test_vectors.json" with { type: "json" };
import testVectorsSpace4k from "../generated/test_vectors_space4k.json" with { type: "json" };
import testVectorsTarget from "../generated/test_vectors_target.json" with { type: "json" };

export interface VectorSection {
  _source?: string;
  _formula?: string;
  _note?: string;
  cases: unknown[];
}

export const vectors = {
  vendetta: testVectors as unknown as Record<string, VectorSection>,
  space4k: testVectorsSpace4k as unknown as Record<string, VectorSection>,
  target: testVectorsTarget as unknown as Record<string, VectorSection>,
};

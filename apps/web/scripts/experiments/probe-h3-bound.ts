// A sender can grind H3 before encryption: these inputs do not depend on drand's future signature.
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { bls12_381 as bls } from "@noble/curves/bls12-381";
import { sha256 } from "@noble/hashes/sha256";
const hash = (...xs: (string | Uint8Array)[]) =>
  sha256(Buffer.concat(xs.map((x) => Buffer.from(x))));
const hex = (x: Uint8Array) => Buffer.from(x).toString("hex");
const start = performance.now();
let found:
  | { trials: number; sigma: string; fileKey: string; firstAcceptedCounter: number; scalar: string }
  | undefined;
for (let trial = 0; trial < 500000; trial++) {
  const sigma = hash("vendetta-h3-bound-sigma", String(trial)).slice(0, 16);
  const fileKey = hash("vendetta-h3-bound-key", String(trial)).slice(0, 16);
  const pre = hash("IBE-H3", sigma, fileKey);
  for (let counter = 1; counter < 65535; counter++) {
    const index = Buffer.alloc(2);
    index.writeUInt16LE(counter);
    const digest = hash(index, pre);
    digest[0] = digest[0]! >> 1;
    const scalar = BigInt("0x" + hex(digest));
    if (scalar < bls.fields.Fr.ORDER) {
      if (counter > 4 && scalar !== 0n)
        found = {
          trials: trial + 1,
          sigma: hex(sigma),
          fileKey: hex(fileKey),
          firstAcceptedCounter: counter,
          scalar: String(scalar),
        };
      break;
    }
  }
  if (found) break;
}
if (!found) throw new Error("No deterministic bound-exhaustion vector found");
const report = {
  scope: "Native H3 grind only; no ZK proof or complete ciphertext",
  fixedCircuitBound: 4,
  elapsedMs: performance.now() - start,
  ...found,
  consequence:
    "These legitimate KEM encryption inputs cannot be handled by the four-candidate circuit. A failed proof is not evidence of invalidity.",
};
writeFileSync(
  new URL("../../../../docs/benchmarks/timelock-opening/h3-bound-probe.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));

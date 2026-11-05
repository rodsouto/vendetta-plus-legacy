// Deterministic cross-language vectors for the bounded tlock KEM circuit.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { bls12_381 as bls } from "@noble/curves/bls12-381";
import { sha256 } from "@noble/hashes/sha256";
import { beacon1000, loadOpeningCases } from "./opening-fixtures.js";
import { deriveFileKey, parseEnvelope } from "./opening.js";
const require = createRequire(import.meta.url);
const { fp12ToBytes } = require("tlock-js/crypto/utils") as typeof import("tlock-js/crypto/utils");
const hash = (...values: (string | Uint8Array)[]) =>
  sha256(Buffer.concat(values.map((v) => Buffer.from(v))));
const xor = (a: Uint8Array, b: Uint8Array) => Uint8Array.from(a, (x, i) => x ^ b[i]!);
const hex = (a: Uint8Array) => Buffer.from(a).toString("hex");
function candidate(sigma: Uint8Array, key: Uint8Array) {
  const pre = hash("IBE-H3", sigma, key);
  for (let i = 1; i < 65535; i++) {
    const counter = Buffer.alloc(2);
    counter.writeUInt16LE(i);
    const digest = hash(counter, pre);
    digest[0] = digest[0]! >> 1;
    const scalar = BigInt("0x" + hex(digest));
    if (scalar < bls.fields.Fr.ORDER) return { scalar, iterations: i };
  }
  throw new Error("H3 bound exhausted");
}
const source = loadOpeningCases().find((c) => c.name === "valid")!;
const envelope = parseEnvelope(source.ciphertext);
if ("status" in envelope) throw new Error("Invalid fixture");
const original = deriveFileKey(envelope, beacon1000);
if ("status" in original) throw new Error("Invalid fixture capsule");
function vector(
  name: string,
  u: Uint8Array,
  v: Uint8Array,
  w: Uint8Array,
  signature = beacon1000.signature,
) {
  const gt = bls.pairing(
    bls.G1.ProjectivePoint.fromHex(signature),
    bls.G2.ProjectivePoint.fromHex(u),
  );
  const sigma = xor(v, hash("IBE-H2", fp12ToBytes(gt)).slice(0, 16));
  const key = xor(w, hash("IBE-H4", sigma).slice(0, 16));
  const { scalar, iterations } = candidate(sigma, key);
  const valid =
    scalar !== 0n &&
    bls.G2.ProjectivePoint.BASE.multiply(scalar).equals(bls.G2.ProjectivePoint.fromHex(u));
  return {
    name,
    signature,
    capsule: hex(Buffer.concat([u, v, w])),
    fileKey: hex(key),
    capsuleValid: valid,
    iterations,
  };
}
const vectors = [vector("archived-client", envelope.u, envelope.v, envelope.w)];
const damagedV = envelope.v.slice();
damagedV[0] = damagedV[0]! ^ 1;
vectors.push(vector("tampered-v", envelope.u, damagedV, envelope.w));
const damagedW = envelope.w.slice();
damagedW[0] = damagedW[0]! ^ 1;
vectors.push(vector("tampered-w", envelope.u, envelope.v, damagedW));
// Exercise deterministic rejection sampling rather than accepting any chosen candidate.
for (let i = 0; i < 10000; i++) {
  const sigma = hash("sigma", String(i)).slice(0, 16),
    key = hash("key", String(i)).slice(0, 16);
  const { scalar, iterations } = candidate(sigma, key);
  if (iterations !== 2 || scalar === 0n) continue;
  const u = bls.G2.ProjectivePoint.BASE.multiply(scalar).toRawBytes(true);
  const gt = bls.pairing(
    bls.G1.ProjectivePoint.fromHex(beacon1000.signature),
    bls.G2.ProjectivePoint.fromHex(u),
  );
  const v = xor(sigma, hash("IBE-H2", fp12ToBytes(gt)).slice(0, 16));
  const w = xor(key, hash("IBE-H4", sigma).slice(0, 16));
  vectors.push(vector("h3-second-candidate", u, v, w));
  break;
}
if (
  vectors.length !== 4 ||
  !vectors[0]!.capsuleValid ||
  vectors[1]!.capsuleValid ||
  vectors[2]!.capsuleValid ||
  !vectors[3]!.capsuleValid
)
  throw new Error("Unexpected vectors");
writeFileSync(
  new URL("../../../../docs/benchmarks/timelock-opening/capsule-input.json", import.meta.url),
  JSON.stringify(
    { scope: "Pairing plus bounded KEM only; no beacon authentication, age or mission", vectors },
    null,
    2,
  ) + "\n",
);
console.log(
  vectors.map((v) => `${v.name}: valid=${v.capsuleValid}, H3 attempts=${v.iterations}`).join("\n"),
);

const probe = JSON.parse(
  readFileSync(
    new URL("../../../../docs/benchmarks/timelock-opening/h3-bound-probe.json", import.meta.url),
    "utf8",
  ),
) as { sigma: string; fileKey: string; firstAcceptedCounter: number };
const sigma = Buffer.from(probe.sigma, "hex"),
  key = Buffer.from(probe.fileKey, "hex");
const h3 = candidate(sigma, key);
if (h3.iterations !== probe.firstAcceptedCounter || h3.iterations <= 4 || h3.scalar === 0n)
  throw new Error("Invalid bound probe");
const u = bls.G2.ProjectivePoint.BASE.multiply(h3.scalar).toRawBytes(true);
const gt = bls.pairing(
  bls.G1.ProjectivePoint.fromHex(beacon1000.signature),
  bls.G2.ProjectivePoint.fromHex(u),
);
const v = xor(sigma, hash("IBE-H2", fp12ToBytes(gt)).slice(0, 16));
const w = xor(key, hash("IBE-H4", sigma).slice(0, 16));
const beyondBound = vector("valid-five-candidates", u, v, w);
if (!beyondBound.capsuleValid) throw new Error("Bound probe must remain a valid KEM capsule");
writeFileSync(
  new URL("../../../../docs/benchmarks/timelock-opening/capsule-bound-input.json", import.meta.url),
  JSON.stringify(beyondBound, null, 2) + "\n",
);
console.log(
  `${beyondBound.name}: valid=${beyondBound.capsuleValid}, H3 attempts=${beyondBound.iterations}`,
);

// Invalid encryption that deliberately uses the second acceptable scalar instead of the first.
// A circuit accepting any acceptable H3 scalar would incorrectly bless this capsule.
let skipped: ReturnType<typeof vector> | undefined;
for (let trial = 0; trial < 100; trial++) {
  const sigma = hash("skip-sigma", String(trial)).slice(0, 16),
    key = hash("skip-key", String(trial)).slice(0, 16);
  if (candidate(sigma, key).iterations !== 1) continue;
  const pre = hash("IBE-H3", sigma, key),
    counter = Buffer.from([2, 0]);
  const second = hash(counter, pre);
  second[0] = second[0]! >> 1;
  const scalar = BigInt("0x" + hex(second));
  if (scalar === 0n || scalar >= bls.fields.Fr.ORDER) continue;
  const u = bls.G2.ProjectivePoint.BASE.multiply(scalar).toRawBytes(true);
  const gt = bls.pairing(
    bls.G1.ProjectivePoint.fromHex(beacon1000.signature),
    bls.G2.ProjectivePoint.fromHex(u),
  );
  const v = xor(sigma, hash("IBE-H2", fp12ToBytes(gt)).slice(0, 16)),
    w = xor(key, hash("IBE-H4", sigma).slice(0, 16));
  skipped = vector("skipped-first-accepted-candidate", u, v, w);
  break;
}
if (!skipped || skipped.capsuleValid || skipped.iterations !== 1)
  throw new Error("Unexpected first-candidate skip vector");
writeFileSync(
  new URL("../../../../docs/benchmarks/timelock-opening/capsule-skip-input.json", import.meta.url),
  JSON.stringify(skipped, null, 2) + "\n",
);
console.log(`${skipped.name}: valid=${skipped.capsuleValid}`);

const { decryptOnG2 } = require("tlock-js/crypto/ibe") as typeof import("tlock-js/crypto/ibe");
if (vectors[0]!.fileKey !== hex(original.fileKey))
  throw new Error("Archived key differs from reference opening");
const interoperability = [];
for (const item of [...vectors, beyondBound, skipped]) {
  const capsule = Buffer.from(item.capsule, "hex");
  let accepted = false;
  try {
    const key = await decryptOnG2(Buffer.from(item.signature, "hex"), {
      U: capsule.slice(0, 96),
      V: capsule.slice(96, 112),
      W: capsule.slice(112),
    });
    accepted = true;
    if (hex(key) !== item.fileKey) throw new Error("Library returned a different file key");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("rP check failed")) throw error;
  }
  if (accepted !== item.capsuleValid) throw new Error(`Library disagrees on ${item.name}`);
  interoperability.push({
    name: item.name,
    expectedValid: item.capsuleValid,
    libraryAccepted: accepted,
    capsuleSha256: hex(hash(capsule)),
  });
}
writeFileSync(
  new URL("../../../../docs/benchmarks/timelock-opening/capsule-interop.json", import.meta.url),
  JSON.stringify({ library: "tlock-js 0.9.0 decryptOnG2", cases: interoperability }, null, 2) +
    "\n",
);
console.log(`${interoperability.length} capsule vectors agree with tlock-js`);

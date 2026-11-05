import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { cpus, totalmem } from "node:os";
import { timelockDecrypt } from "tlock-js";
import { encodeHiddenPlain } from "@vendetta/rules";
import {
  beacon1000,
  fixtureDirectory,
  loadOpeningCases,
  offlineClient,
} from "./opening-fixtures.js";
import {
  deriveFileKey,
  evaluateOpening,
  parseEnvelope,
  RULES_DIGEST,
  sha256Hex,
} from "./opening.js";

const output = fileURLToPath(
  new URL("../../../../docs/benchmarks/timelock-opening/", import.meta.url),
);
mkdirSync(output, { recursive: true });
const cases = loadOpeningCases();
const results = cases.map((c) => {
  const evaluated = evaluateOpening(c.ciphertext, c.context, c.beacon, BigInt(c.now));
  if (
    evaluated.result.status !== c.expected ||
    (c.expectedReason &&
      (evaluated.result.status === "valid" || evaluated.result.reason !== c.expectedReason))
  )
    throw new Error(`Unexpected classification: ${c.name}`);
  return { name: c.name, expected: c.expected, ...evaluated };
});
const valid = cases.find((c) => c.name === "valid")!;
const fullLibrary = await timelockDecrypt(valid.ciphertext, offlineClient);
const reference = evaluateOpening(
  valid.ciphertext,
  valid.context,
  valid.beacon,
  BigInt(valid.now),
).result;
if (reference.status !== "valid" || fullLibrary.toString() !== encodeHiddenPlain(reference.plain))
  throw new Error("Reference does not match tlock-js");
const samples = [];
for (let i = 0; i < 10; i++) {
  const start = performance.now();
  const evaluated = evaluateOpening(valid.ciphertext, valid.context, beacon1000, BigInt(valid.now));
  if (evaluated.result.status !== "valid") throw new Error("Unstable opening");
  samples.push({ totalMs: performance.now() - start, ...evaluated.ms });
}
const parsed = parseEnvelope(valid.ciphertext);
if ("status" in parsed) throw new Error("Cannot extract pairing input");
const capsule = deriveFileKey(parsed, beacon1000);
if ("status" in capsule) throw new Error("Invalid reference capsule");
const limbs: string[] = [];
for (const outer of [capsule.gt.c0, capsule.gt.c1])
  for (const inner of [outer.c0, outer.c1, outer.c2])
    limbs.push(String(inner.c0), String(inner.c1));
const input = {
  signature: beacon1000.signature,
  u: Buffer.from(parsed.u).toString("hex"),
  gt: limbs,
};
writeFileSync(join(output, "pairing-input.json"), JSON.stringify(input, null, 2) + "\n");
const files = ["opening.ts", "opening-fixtures.ts", "run-opening.ts"];
const hashes = Object.fromEntries(
  files.map((file) => [file, sha256Hex(readFileSync(new URL(file, import.meta.url)))]),
);
for (const file of ["cases.json", "quicknet-1000.json", "quicknet-1001.json"])
  hashes[`fixtures/${file}`] = sha256Hex(readFileSync(fixtureDirectory + file));
const values = samples.map((s) => s.totalMs).sort((a, b) => a - b);
const report = {
  schema: 1,
  node: process.version,
  componentOnly: false,
  succinctProofGeneratedByThisScript: false,
  rulesDigest: RULES_DIGEST,
  hardware: { cpu: cpus()[0]?.model, logicalCpus: cpus().length, totalMemoryBytes: totalmem() },
  profile:
    "tlock-js 0.9.0 / quicknet / single age stanza / 16-byte capsule key / one payload chunk",
  libraryInteroperability: true,
  ciphertextBytes: Buffer.byteLength(valid.ciphertext),
  plaintextBytes: fullLibrary.length,
  nodeOpeningMedianMs: values[4],
  nodeOpeningMinMs: values[0],
  nodeOpeningMaxMs: values[9],
  maxRssKiB: process.resourceUsage().maxRSS,
  samples,
  hashes,
  cases: results,
};
writeFileSync(
  join(output, "node-results.json"),
  JSON.stringify(report, (_, v: unknown) => (typeof v === "bigint" ? String(v) : v), 2) + "\n",
);
console.log(
  `${results.length} classifications matched; node median ${values[4]!.toFixed(2)} ms; pairing input exported`,
);

// Research-only composition with a real locally generated Groth16 verifier.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const src = join(root, "apps/web/scripts/experiments/h3-stepper");
const artifacts = join(root, "docs/benchmarks/timelock-opening/paginated-kem");
const work = resolve(process.argv[2] ?? "/tmp/vendetta-opening-tools/paginated-kem-proof-evm");
for (const dir of ["src", "test"]) mkdirSync(join(work, dir), { recursive: true });
for (const name of ["H3Prefix.sol", "PaginatedKEM.sol"])
  copyFileSync(join(src, name), join(work, "src", name));
copyFileSync(join(artifacts, "PairingVerifier.sol"), join(work, "src/PaginatedVerifier.sol"));
for (const name of ["PaginatedKEM.t.sol", "PaginatedKEMProof.t.sol"]) {
  const text = readFileSync(join(src, name), "utf8").replaceAll('from "./', 'from "../src/');
  writeFileSync(join(work, "test", name), text);
}
for (const name of ["proof.json", "invalid-proof.json"])
  copyFileSync(join(artifacts, name), join(work, name));
writeFileSync(
  join(work, "foundry.toml"),
  '[profile.default]\nsrc="src"\ntest="test"\nevm_version="cancun"\noptimizer=true\noptimizer_runs=200\nfs_permissions=[{access="read",path="./proof.json"},{access="read",path="./invalid-proof.json"}]\n',
);
const extra = process.env.SOLC_BIN ? ["--use", process.env.SOLC_BIN] : [];
const result = spawnSync(
  process.env.FORGE_BIN ?? join(homedir(), ".foundry/bin/forge"),
  ["test", "--root", work, ...extra, "-vv"],
  { encoding: "utf8", timeout: 300000 },
);
writeFileSync(join(work, "test-output.log"), result.stdout + result.stderr);
if (result.status !== 0)
  throw new Error(result.stdout + result.stderr + String(result.error ?? ""));
if (!/10 tests passed, 0 failed, 0 skipped/.test(result.stdout))
  throw new Error("Expected ten tests");
const compiled = JSON.parse(
  readFileSync(join(work, "out/PaginatedVerifier.sol/Verifier.json"), "utf8"),
) as { deployedBytecode: { object: string } };
const bytes = compiled.deployedBytecode.object.replace(/^0x/, "").length / 2;
if (bytes > 24576) throw new Error("Verifier exceeds EIP170");
const report = {
  scope:
    "Real experimental KEM proof + exact H3 prefix composition; NOT beacon, age or mission authentication",
  testsPassed: 10,
  verifierCallGasCap: 2_000_000,
  verifierDeployedBytes: bytes,
  evm: "cancun",
  solc: "0.8.28",
  optimizerRuns: 200,
  productionIntegrated: false,
  setup: "Local unsafe research setup; never reuse in production",
  verifierSourceSha256: createHash("sha256")
    .update(readFileSync(join(artifacts, "PairingVerifier.sol")))
    .digest("hex"),
};
writeFileSync(join(artifacts, "evm-results.json"), JSON.stringify(report, null, 2) + "\n");
console.log(result.stdout);
console.log(JSON.stringify(report));

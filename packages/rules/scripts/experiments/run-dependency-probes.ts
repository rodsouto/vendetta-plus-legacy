import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { dependencyProbes } from "./dependency-probes.js";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const files = [
  "packages/rules/scripts/experiments/dependency-probes.ts",
  "packages/rules/scripts/experiments/run-dependency-probes.ts",
  ...["missions", "settle", "common", "actions", "families", "market", "state"].map(
    (name) => `packages/rules/src/sim/${name}.ts`,
  ),
  "packages/rules/src/combat.ts",
  "packages/rules/src/honor.ts",
  "packages/rules/src/stats.ts",
  "packages/spec-data/generated/vendetta.json",
  "packages/spec-data/generated/game_config.json",
  "pnpm-lock.yaml",
];
const probes = dependencyProbes();
for (const p of probes) {
  if (p.matches !== (p.expected === "commutes-on-projection"))
    throw new Error(`Unexpected result: ${p.name}`);
}
const output = join(root, "docs/benchmarks/hidden-dependencies");
mkdirSync(output, { recursive: true });
writeFileSync(
  join(output, "results.json"),
  JSON.stringify(
    {
      schema: 1,
      nodeVersion: process.version,
      model:
        "Seeded state; controlled queue isolation over the real TS simulator. Counterfactual ordering is not permitted by the current public API.",
      sourceHashes: Object.fromEntries(
        files.map((file) => [
          file,
          createHash("sha256")
            .update(readFileSync(join(root, file)))
            .digest("hex"),
        ]),
      ),
      probes,
    },
    (_, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
    2,
  ) + "\n",
);
console.log(
  `${probes.length} dependency probes matched expectations. Wrote ${output}/results.json`,
);

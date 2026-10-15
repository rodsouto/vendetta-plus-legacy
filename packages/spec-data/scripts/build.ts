// Converts the spec data files (docs/spec/data/*.yaml, the source of truth) into JSON that both the
// TypeScript packages and the Foundry tests can read. Output is deterministic: run `pnpm codegen`
// and commit the result. Do not edit generated/ by hand.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const specData = join(here, "../../../docs/spec/data");
const outDir = join(here, "../generated");

const FILES = [
  "vendetta",
  "space4k",
  "game_config",
  "test_vectors",
  "test_vectors_space4k",
  "test_vectors_target",
];

mkdirSync(outDir, { recursive: true });
for (const name of FILES) {
  const data: unknown = parse(readFileSync(join(specData, `${name}.yaml`), "utf8"));
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(data, null, 2) + "\n");
  console.log(`generated/${name}.json`);
}

// Converts the spec data files (docs/spec/data/*.yaml, the source of truth) into:
//   - generated/*.json: the same data as JSON, for the TypeScript packages;
//   - generated/fixtures/*.json: test vectors normalized for Foundry (fixtures.ts);
//   - contracts/src/generated/<Ruleset>Ruleset.sol: ruleset constants (solidity.ts).
// Output is deterministic: run `pnpm codegen` and commit the result. Do not edit it by hand.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  combatFixtures,
  honorFixtures,
  lootFixtures,
  troopStatsFixtures,
  upgradeFixtures,
  distanceFixtures,
} from "./fixtures.js";
import { rulesetLibrary } from "./solidity.js";
import { entityStrings } from "./i18n.js";

const here = dirname(fileURLToPath(import.meta.url));
const specData = join(here, "../../../docs/spec/data");
const outDir = join(here, "../generated");
const solidityDir = join(here, "../../../contracts/src/generated");

const FILES = [
  "vendetta",
  "space4k",
  "game_config",
  "test_vectors",
  "test_vectors_space4k",
  "test_vectors_target",
];
/// Rulesets with generated contracts and fixtures. Space4k follows when the v1 works (Q45).
const ONCHAIN_RULESETS = ["vendetta"];

const write = (path: string, content: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  console.log(path.slice(join(here, "../../..").length + 1));
};
const json = (data: unknown) => JSON.stringify(data, null, 2) + "\n";

const data: Record<string, any> = {};
for (const name of FILES) {
  data[name] = parse(readFileSync(join(specData, `${name}.yaml`), "utf8"));
  write(join(outDir, `${name}.json`), json(data[name]));
}

for (const rs of ONCHAIN_RULESETS) {
  const ruleset = data[rs];
  const legacy = data[rs === "vendetta" ? "test_vectors" : `test_vectors_${rs}`];
  const target = data.test_vectors_target;
  const troops: string[] = ruleset.troops.map((t: { id: string }) => t.id);
  const combatCases = [
    ...target[`combat_target_${rs}`].cases,
    ...target[`combat_target_${rs}_random`].cases,
  ];

  const lib = rulesetLibrary(ruleset, data.game_config);
  write(join(solidityDir, `${lib.name}.sol`), lib.source);

  const fixtures = join(outDir, "fixtures", rs);
  write(join(fixtures, "combat.json"), json(combatFixtures(troops, combatCases)));
  write(
    join(fixtures, "troop_stats.json"),
    json(
      troopStatsFixtures(
        ruleset.troops,
        legacy.troop_stats.cases,
        target[`combat_target_${rs}`].cases,
      ),
    ),
  );
  write(join(fixtures, "loot.json"), json(lootFixtures(legacy.loot.cases)));
  write(join(fixtures, "honor.json"), json(honorFixtures(legacy.honor.cases)));
  write(
    join(fixtures, "distance.json"),
    json(distanceFixtures(legacy.distance_mission.cases, legacy.distance_mission_random.cases)),
  );
  write(
    join(fixtures, "upgrades.json"),
    json(
      upgradeFixtures(
        ruleset.buildings.map((b: { id: string }) => b.id),
        ruleset.research.map((r: { id: string }) => r.id),
        ruleset.resources,
        legacy.building_upgrade.cases,
        legacy.research_upgrade.cases,
      ),
    ),
  );
}

// UI names of rooms, research and troops, from the legacy language files.
const languages = join(here, "../../../application/languages/vendetta");
for (const lang of ["es", "en"]) {
  write(
    join(outDir, "i18n", `${lang}.json`),
    json(entityStrings(join(languages, `${lang}.php`), data.vendetta)),
  );
}

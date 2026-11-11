// Storage layout check for upgrades (B-17). The game state lives in one ERC-7201 namespace
// (CoreState, src/core/GameStorage.sol), which `forge inspect Game` does not show, so the layout
// is read from test/layout/CoreStateLayout.sol (CoreState at slot 0: offsets relative to the base).
//
// storage-layout.json is the accepted layout; the rules are in layout.mjs.
//
//   node scripts/storage-layout.mjs                    check (fails if incompatible or not recorded)
//   node scripts/storage-layout.mjs --update           record a compatible layout
//   node scripts/storage-layout.mjs --update --force   record any layout (only before a deploy)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { incompatibilities, normalize } from "./layout.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = join(root, "storage-layout.json");
const args = new Set(process.argv.slice(2));

function fail(message) {
  console.error(message);
  process.exit(1);
}

let now;
try {
  now = normalize(
    JSON.parse(
      execFileSync(
        "forge",
        ["inspect", "CoreStateLayout", "storageLayout", "--json"],
        { cwd: root, encoding: "utf8" },
      ),
    ),
  );
} catch (e) {
  fail(`Storage layout cannot be checked: ${e.message}`);
}
const old = existsSync(snapshotPath) ? JSON.parse(readFileSync(snapshotPath, "utf8")) : null;
const errors = old ? incompatibilities(old, now) : [];
const report = `Incompatible storage layout (B-17):\n  ${errors.join("\n  ")}`;

if (args.has("--update")) {
  if (errors.length && !args.has("--force"))
    fail(`${report}\nOnly before any deploy: --update --force records it anyway.`);
  writeFileSync(snapshotPath, JSON.stringify(now, null, 2) + "\n");
  console.log("contracts/storage-layout.json updated");
} else if (errors.length) {
  fail(report);
} else if (JSON.stringify(old) !== JSON.stringify(now)) {
  fail(
    "Storage layout changed compatibly but is not recorded: " +
      "run `pnpm --filter @vendetta/contracts layout`.",
  );
} else {
  console.log("Storage layout matches contracts/storage-layout.json");
}

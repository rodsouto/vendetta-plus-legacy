// Isolated source overlay for explicitly requested local acceptance acceleration.
// Production source files and final verifier artifacts are never written.
import { cp, mkdir, readFile, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

export const scaledSeconds = (seconds: bigint, factor: number) => {
  if (![1, 100].includes(factor)) throw new Error("Unsupported acceptance time scale");
  return seconds === 0n ? 0n : seconds / BigInt(factor) || 1n;
};
export async function prepareAcceptanceClock(repository: string, run: string, factor: number) {
  if (factor !== 100) throw new Error("Clock overlay requires explicit factor 100");
  const source = join(repository, "contracts");
  const overlay = join(run, "contracts-source");
  await mkdir(overlay, { mode: 0o700 });
  await cp(join(source, "src"), join(overlay, "src"), { recursive: true });
  await mkdir(join(overlay, "script"));
  await cp(join(source, "script/Deploy.s.sol"), join(overlay, "script/Deploy.s.sol"));
  for (const file of ["foundry.toml", "remappings.txt"])
    await cp(join(source, file), join(overlay, file));
  await symlink(join(source, "node_modules"), join(overlay, "node_modules"), "dir");
  const clock = await readFile(join(source, "acceptance/LocalAcceptanceClock.sol"), "utf8");
  await writeFile(join(overlay, "src/core/LocalAcceptanceClock.sol"), clock, { flag: "wx" });
  const patches = {
    "src/core/Settlement.sol": [
      [
        "return Costs.room(room, b.levels[room], b.levels[Ruleset.BUILD_SPEED_ROOM]);",
        "(cost, seconds_) = Costs.room(room, b.levels[room], b.levels[Ruleset.BUILD_SPEED_ROOM]);\n        seconds_ = LocalAcceptanceClock.seconds_(seconds_);",
      ],
      [
        "return Costs.research(research, p.research[research], b.levels[Ruleset.RESEARCH_SPEED_ROOM]);",
        "(cost, seconds_) = Costs.research(research, p.research[research], b.levels[Ruleset.RESEARCH_SPEED_ROOM]);\n        seconds_ = LocalAcceptanceClock.seconds_(seconds_);",
      ],
      [
        "return Ruleset.troopSeconds()[troop] * item.quantity / b.levels[Ruleset.trainedAt()[troop]];",
        "return LocalAcceptanceClock.seconds_(Ruleset.troopSeconds()[troop] * item.quantity / b.levels[Ruleset.trainedAt()[troop]]);",
      ],
    ],
    "src/core/Missions.sol": [
      [
        "plan.duration = Map.travelSeconds(dist, plan.speed);",
        "plan.duration = LocalAcceptanceClock.seconds_(Map.travelSeconds(dist, plan.speed));",
      ],
    ],
  };
  const changes = [];
  for (const [file, replacements] of Object.entries(patches)) {
    const original = await readFile(join(source, file), "utf8");
    let modified = original.replace(
      "pragma solidity 0.8.28;",
      'pragma solidity 0.8.28;\nimport {LocalAcceptanceClock} from "./LocalAcceptanceClock.sol";',
    );
    for (const [before, after] of replacements) {
      if (!before || !after || modified.split(before).length !== 2)
        throw new Error("Clock patch source mismatch: " + file);
      modified = modified.replace(before, after);
    }
    await writeFile(join(overlay, file), modified);
    const hash = (s: string) => createHash("sha256").update(s).digest("hex");
    changes.push({
      file,
      originalSha256: hash(original),
      overlaySha256: hash(modified),
      replacements,
    });
  }
  await writeFile(
    join(run, "acceptance-clock.json"),
    JSON.stringify(
      {
        scope: "temporary local Game timing only",
        chainId: 31337,
        factor,
        formula: "value == 0 ? 0 : max(1, floor(value / factor))",
        wallClock: true,
        futureAuthenticDrand: true,
        unchangedProductionSources: true,
        overlay,
        changes,
      },
      null,
      2,
    ) + "\n",
  );
  return overlay;
}

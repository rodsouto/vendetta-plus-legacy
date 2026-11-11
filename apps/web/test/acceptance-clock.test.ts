import { it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareAcceptanceClock, scaledSeconds } from "../scripts/local-hidden/acceptance-clock.js";
const repository = fileURLToPath(new URL("../../../", import.meta.url));
it("keeps clock scaling positive, exact at floor boundaries and opt-in", () => {
  expect([0n, 1n, 99n, 100n, 101n, 5600n, 1400n, 4173n].map((n) => scaledSeconds(n, 100))).toEqual([
    0n,
    1n,
    1n,
    1n,
    1n,
    56n,
    14n,
    41n,
  ]);
  expect(scaledSeconds(4173n, 1)).toBe(4173n);
  expect(() => scaledSeconds(10n, 2)).toThrow();
});
it("patches only a private copy, preserves source and gates the clock to local chain", async () => {
  const out = await mkdtemp(join(tmpdir(), "vendetta-clock-"));
  try {
    const original = await readFile(join(repository, "contracts/src/core/Missions.sol"), "utf8");
    const overlay = await prepareAcceptanceClock(repository, out, 100);
    expect(await readFile(join(repository, "contracts/src/core/Missions.sol"), "utf8")).toBe(
      original,
    );
    expect(await readFile(join(overlay, "src/core/Missions.sol"), "utf8")).toContain(
      "plan.duration = LocalAcceptanceClock.seconds_(Map.travelSeconds(dist, plan.speed));",
    );
    expect(await readFile(join(overlay, "src/core/LocalAcceptanceClock.sol"), "utf8")).toContain(
      'require(block.chainid == 31337, "Local acceptance clock only")',
    );
    const metadata = JSON.parse(await readFile(join(out, "acceptance-clock.json"), "utf8"));
    expect(metadata.changes.map((c: { file: string }) => c.file)).toEqual([
      "src/core/Settlement.sol",
      "src/core/Missions.sol",
    ]);
    expect(metadata.factor).toBe(100);
    await expect(prepareAcceptanceClock(repository, out, 2)).rejects.toThrow();
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it.skipIf(spawnSync("systemd-analyze", ["--version"]).status !== 0)(
  "validates both service templates after substituting the installed Node executable",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "vendetta-service-units-"));
    try {
      const rendered: string[] = [];
      for (const name of ["producer", "keeper"]) {
        const path = fileURLToPath(
          new URL(`../../../scripts/systemd/vendetta-${name}.service`, import.meta.url),
        );
        const source = await readFile(path, "utf8");
        expect(source).toContain("ExecStart=/usr/bin/node --import ");
        const out = join(dir, `vendetta-${name}.service`);
        await writeFile(
          out,
          source.replace("ExecStart=/usr/bin/node ", `ExecStart=${process.execPath} `),
        );
        rendered.push(out);
      }
      execFileSync("systemd-analyze", ["verify", ...rendered], { stdio: "pipe" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { keccak256 } from "viem";
import { loadLocalStackConfig, type LocalStackConfig } from "../scripts/local-hidden/config.js";
let base: string, configFile: string, repository: string, config: LocalStackConfig;
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "vendetta-local-config-"));
  repository = join(base, "repo");
  await mkdir(repository);
  const keys = join(base, "keys");
  await mkdir(keys);
  const hashes: Record<string, { setup: string; runtime: string }> = {};
  for (const kind of ["opening", "invalid-point"]) {
    await mkdir(join(keys, kind));
    const manifest = JSON.stringify({
      kind,
      profile: "VENDETTA_OPENING_V2",
      unsafeLocalSetup: true,
    });
    await writeFile(join(keys, kind, "manifest.json"), manifest);
    hashes[kind] = { setup: sha(manifest), runtime: keccak256("0x6000") };
    const out = join(base, "evm", "out", kind + ".sol");
    await mkdir(out, { recursive: true });
    await writeFile(
      join(out, "Verifier.json"),
      JSON.stringify({
        abi: [],
        bytecode: { object: "0x6000" },
        deployedBytecode: { object: "0x6000" },
      }),
    );
  }
  const runtime = JSON.stringify(hashes);
  await writeFile(join(base, "runtime.json"), runtime);
  await writeFile(join(base, "native"), "never execute this fixture");
  config = {
    unsafeLocalSetup: true,
    binary: join(base, "native"),
    binarySha256: sha("never execute this fixture"),
    openingKeys: join(keys, "opening"),
    openingManifestSha256: hashes.opening!.setup,
    pointKeys: join(keys, "invalid-point"),
    pointManifestSha256: hashes["invalid-point"]!.setup,
    verifierArtifacts: join(base, "evm"),
    runtimeFile: join(base, "runtime.json"),
    runtimeSha256: sha(runtime),
  };
  configFile = join(base, "config.json");
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});
async function load(output = join(base, "new-run")) {
  await writeFile(configFile, JSON.stringify(config));
  return loadLocalStackConfig(configFile, output, repository);
}
it("loads existing public artifacts and pins without creating run state or invoking the native binary", async () => {
  const c = await load();
  expect(c.ports).toEqual({ rpc: 18545, prover: 18787, web: 15173 });
  await expect(readFile(join(base, "new-run", "inputs.json"))).rejects.toThrow("ENOENT");
});
it.each(["binarySha256", "openingManifestSha256", "pointManifestSha256", "runtimeSha256"] as const)(
  "rejects changed %s",
  async (key) => {
    config[key] = "0".repeat(64);
    await expect(load()).rejects.toThrow(/pin mismatch/);
  },
);
it("requires explicit experimental scope and rejects foreign RPC/chain configuration", async () => {
  Object.assign(config, { unsafeLocalSetup: false });
  await expect(load()).rejects.toThrow("Explicit");
  Object.assign(config, { unsafeLocalSetup: true, rpc: "https://example.com" });
  await expect(load()).rejects.toThrow("Unknown");
});
it.each([{ rpc: 18545, web: 18545 }, { rpc: 80 }, { prover: 65536 }, { web: 1.5 }])(
  "rejects invalid local ports %j",
  async (ports) => {
    config.ports = ports;
    await expect(load()).rejects.toThrow("distinct local ports");
  },
);
it("rejects run directories inside sources or resolved key/artifact directories", async () => {
  await expect(load(join(repository, "run"))).rejects.toThrow("outside");
  await symlink(config.openingKeys, join(base, "alias"));
  await expect(load(join(base, "alias", "run"))).rejects.toThrow("outside");
  await expect(load(join(config.verifierArtifacts, "run"))).rejects.toThrow("outside");
});
it("rejects an artifact whose declared runtime differs from the pinned metadata", async () => {
  const file = join(config.verifierArtifacts, "out/opening.sol/Verifier.json");
  const a = JSON.parse(await readFile(file, "utf8"));
  a.deployedBytecode.object = "0x6001";
  await writeFile(file, JSON.stringify(a));
  await expect(load()).rejects.toThrow("runtime/setup mismatch");
});

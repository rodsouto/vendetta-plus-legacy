// Compile only public generated verifiers; proving keys never enter the Solidity project.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { keccak256, type Hex } from "viem";
const exec = promisify(execFile);
export async function compileProducerVerifiers(keys: string, forge: string, solc?: string) {
  const work = join(keys, "evm"),
    src = join(work, "src");
  await mkdir(src, { recursive: true });
  for (const kind of ["opening", "invalid-point"]) {
    const manifest = JSON.parse(await readFile(join(keys, kind, "manifest.json"), "utf8"));
    const source = await readFile(join(keys, kind, "Verifier.sol"));
    if (createHash("sha256").update(source).digest("hex") !== manifest.sha256["Verifier.sol"])
      throw new Error("Verifier source integrity failure");
    await writeFile(join(src, kind + ".sol"), source);
  }
  await writeFile(
    join(work, "foundry.toml"),
    '[profile.default]\nsrc="src"\nevm_version="cancun"\noptimizer=true\noptimizer_runs=200\n',
  );
  await exec(forge, ["build", "--root", work, ...(solc ? ["--use", solc] : [])], {
    maxBuffer: 2 ** 20,
  });
  const hashes: Record<string, { runtime: Hex; setup: string }> = {};
  for (const kind of ["opening", "invalid-point"]) {
    const a = JSON.parse(await readFile(join(work, "out", kind + ".sol", "Verifier.json"), "utf8"));
    hashes[kind] = {
      runtime: keccak256(a.deployedBytecode.object as Hex),
      setup: createHash("sha256")
        .update(await readFile(join(keys, kind, "manifest.json")))
        .digest("hex"),
    };
  }
  await writeFile(join(keys, "verifier-runtime.json"), JSON.stringify(hashes, null, 2) + "\n");
  return work;
}

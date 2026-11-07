// Compile only public generated verifiers; proving keys never enter the Solidity project.
import { readFile, writeFile, mkdir, realpath } from "node:fs/promises";
import { join, resolve, relative, isAbsolute, dirname, basename, sep } from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { keccak256, type Hex } from "viem";
const exec = promisify(execFile);
export async function compileProducerVerifiers(
  keys: string,
  forge: string,
  solc: string | undefined,
  output: string,
) {
  if (!output) throw new Error("A fresh verifier output directory is required");
  const work = join(await realpath(dirname(resolve(output))), basename(resolve(output)));
  for (const directory of [keys, join(keys, "opening"), join(keys, "invalid-point")]) {
    const inside = relative(await realpath(directory), work);
    if (!inside || (!inside.startsWith(".." + sep) && inside !== ".." && !isAbsolute(inside)))
      throw new Error("Verifier output must be outside the key directory");
  }
  // Claim a new directory before writing anything. Failed builds remain for diagnosis.
  await mkdir(work, { mode: 0o700 });
  const src = join(work, "src");
  await mkdir(src);
  const setupDigests: Record<string, string> = {};
  for (const kind of ["opening", "invalid-point"]) {
    const manifestBytes = await readFile(join(keys, kind, "manifest.json"));
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    if (manifest.kind !== kind) throw new Error("Verifier manifest kind mismatch");
    setupDigests[kind] = createHash("sha256").update(manifestBytes).digest("hex");
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
      runtime: verifierRuntime(a.deployedBytecode?.object),
      setup: setupDigests[kind]!,
    };
  }
  await writeFile(join(work, "verifier-runtime.json"), JSON.stringify(hashes, null, 2) + "\n", {
    flag: "wx",
  });
  return work;
}

function verifierRuntime(value: unknown): Hex {
  if (typeof value !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(value))
    throw new Error("Invalid or empty deployed verifier bytecode");
  return keccak256(value as Hex);
}

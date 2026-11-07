import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { keccak256 } from "viem";
import { compileProducerVerifiers } from "../scripts/prover/compile.js";

let dir: string, keys: string, compiler: string;
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vendetta-compile-"));
  keys = join(dir, "keys");
  await mkdir(keys);
  for (const kind of ["opening", "invalid-point"]) {
    await mkdir(join(keys, kind));
    await writeFile(join(keys, kind, "Verifier.sol"), "synthetic public source " + kind);
    await writeFile(
      join(keys, kind, "manifest.json"),
      JSON.stringify({
        kind,
        sha256: { "Verifier.sol": digest("synthetic public source " + kind) },
      }),
    );
  }
  await writeFile(join(keys, "verifier-runtime.json"), "archived metadata must survive");
  compiler = join(dir, "compiler");
  await fakeCompiler("");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
async function fakeCompiler(extra: string, object = "0x6000") {
  await writeFile(
    compiler,
    `#!/usr/bin/env node\nconst fs=require('node:fs'),path=require('node:path');\nconst root=process.argv[process.argv.indexOf('--root')+1];fs.writeFileSync(path.join(root,'compiler-ran'),'yes');\n${extra}\nfor(const kind of ['opening','invalid-point']) { const d=path.join(root,'out',kind+'.sol');fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,'Verifier.json'),JSON.stringify({deployedBytecode:{object:${JSON.stringify(object)}}})); }\n`,
  );
  await chmod(compiler, 0o700);
}
it("keeps original artifacts and pins captured manifests even if inputs change during compilation", async () => {
  const original = await readFile(join(keys, "opening", "manifest.json"), "utf8");
  await fakeCompiler(
    `fs.writeFileSync(${JSON.stringify(join(keys, "opening", "manifest.json"))},'changed after capture');`,
  );
  const work = await compileProducerVerifiers(keys, compiler, undefined, join(dir, "new-output"));
  const result = JSON.parse(await readFile(join(work, "verifier-runtime.json"), "utf8"));
  expect(result.opening).toEqual({ runtime: keccak256("0x6000"), setup: digest(original) });
  expect(await readFile(join(keys, "verifier-runtime.json"), "utf8")).toBe(
    "archived metadata must survive",
  );
  expect(await readFile(join(work, "src", "opening.sol"), "utf8")).toBe(
    "synthetic public source opening",
  );
});
it("rejects missing output, reused output and output inside keys including symlink parents", async () => {
  await expect(compileProducerVerifiers(keys, compiler, undefined, undefined!)).rejects.toThrow(
    "fresh verifier output",
  );
  await expect(compileProducerVerifiers(keys, compiler, undefined, keys)).rejects.toThrow(
    "outside",
  );
  await expect(
    compileProducerVerifiers(keys, compiler, undefined, join(keys, "new")),
  ).rejects.toThrow("outside");
  await symlink(keys, join(dir, "alias"));
  await expect(
    compileProducerVerifiers(keys, compiler, undefined, join(dir, "alias", "new")),
  ).rejects.toThrow("outside");
  const output = join(dir, "existing");
  await mkdir(output);
  await writeFile(join(output, "sentinel"), "keep");
  await expect(compileProducerVerifiers(keys, compiler, undefined, output)).rejects.toThrow(
    "EEXIST",
  );
  expect(await readFile(join(output, "sentinel"), "utf8")).toBe("keep");
});
it("rejects changed source before invoking the compiler", async () => {
  await writeFile(join(keys, "opening", "Verifier.sol"), "tampered");
  await expect(
    compileProducerVerifiers(keys, compiler, undefined, join(dir, "failed")),
  ).rejects.toThrow("integrity");
  await expect(readFile(join(dir, "failed", "verifier-runtime.json"))).rejects.toThrow("ENOENT");
});
it.each(["", "0x", "6000", "0x0", "0xzz", "0x__$link$__"])(
  "rejects invalid deployed bytecode %j without final metadata",
  async (object) => {
    await fakeCompiler("", object);
    await expect(
      compileProducerVerifiers(keys, compiler, undefined, join(dir, "failed")),
    ).rejects.toThrow("bytecode");
    await expect(readFile(join(dir, "failed", "verifier-runtime.json"))).rejects.toThrow("ENOENT");
  },
);

it("rejects a swapped manifest kind before compilation", async () => {
  const file = join(keys, "opening", "manifest.json");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  await writeFile(file, JSON.stringify({ ...manifest, kind: "invalid-point" }));
  await expect(
    compileProducerVerifiers(keys, compiler, undefined, join(dir, "failed")),
  ).rejects.toThrow("kind mismatch");
  await expect(readFile(join(dir, "failed", "compiler-ran"))).rejects.toThrow("ENOENT");
});
it("rejects output under a symlinked circuit archive and forwards the selected compiler", async () => {
  const external = join(dir, "external-archive");
  await mkdir(external);
  await rm(join(keys, "opening"), { recursive: true });
  await symlink(external, join(keys, "opening"));
  await expect(
    compileProducerVerifiers(keys, compiler, undefined, join(external, "build")),
  ).rejects.toThrow("outside");
  const source = "synthetic external source";
  await writeFile(join(external, "Verifier.sol"), source);
  await writeFile(
    join(external, "manifest.json"),
    JSON.stringify({ kind: "opening", sha256: { "Verifier.sol": digest(source) } }),
  );
  await fakeCompiler(
    "if(process.argv[process.argv.indexOf('--use')+1]!=='chosen-solc')process.exit(9);",
  );
  await compileProducerVerifiers(keys, compiler, "chosen-solc", join(dir, "new-output"));
});

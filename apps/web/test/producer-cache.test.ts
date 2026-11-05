import { mkdtemp, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cacheLimits, pruneCache } from "../scripts/prover/cache.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "producer-cache-"));
  dirs.push(dir);
  return dir;
}
const key = (id: number) => `0x${id.toString(16).padStart(64, "0")}`;
const proof = (id: number) => `${key(id)}.${"a".repeat(64)}.proof.json`;
async function file(dir: string, name: string, time = 9000) {
  const path = join(dir, name);
  await writeFile(path, "1234");
  await utimes(path, time / 1000, time / 1000);
  return path;
}
describe("producer cache retention", () => {
  it.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid limits %s",
    (value) => {
      for (const name of ["maxBytes", "maxFiles", "maxAgeMs"])
        expect(() => cacheLimits({ [name]: value })).toThrow("Invalid producer cache");
    },
  );
  it("removes expired proofs and abandoned request/inspection files, preserving unrelated files", async () => {
    const dir = await fixture();
    for (const suffix of ["request", "inspect-request", "inspect"])
      await file(dir, `${key(1)}.${suffix}.json`);
    const expired = await file(dir, proof(1), 1000);
    const unknown = await file(dir, "manifest.json");
    await file(dir, proof(2));
    expect(await pruneCache(dir, cacheLimits({ maxAgeMs: 5000 }), 10000)).toEqual({
      bytes: 4,
      files: 1,
    });
    await expect(readFile(expired)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(unknown, "utf8")).toBe("1234");
  });
  it("evicts oldest proofs until both budgets hold and permits repopulation", async () => {
    const dir = await fixture();
    const oldest = await file(dir, proof(1), 7000);
    await file(dir, proof(2), 8000);
    await file(dir, proof(3));
    const limits = cacheLimits({ maxFiles: 2, maxBytes: 5 });
    expect(await pruneCache(dir, limits, 10000)).toEqual({ bytes: 4, files: 1 });
    await expect(readFile(oldest)).rejects.toMatchObject({ code: "ENOENT" });
    await file(dir, proof(4), 9500);
    expect(await pruneCache(dir, limits, 10000)).toEqual({ bytes: 4, files: 1 });
    expect(await readFile(join(dir, proof(4)), "utf8")).toBe("1234");
  });
  it("enforces file count independently and evicts a single oversized proof", async () => {
    const dir = await fixture();
    await file(dir, proof(1));
    await file(dir, proof(2));
    expect(await pruneCache(dir, cacheLimits({ maxFiles: 1 }), 10000)).toEqual({
      bytes: 4,
      files: 1,
    });
    expect(await pruneCache(dir, cacheLimits({ maxBytes: 3 }), 10000)).toEqual({
      bytes: 0,
      files: 0,
    });
  });
  it("rejects managed symlinks without touching their targets", async () => {
    const dir = await fixture();
    const target = await file(dir, "keys.json");
    await symlink(target, join(dir, proof(1)));
    await expect(pruneCache(dir, cacheLimits())).rejects.toThrow("Unexpected producer cache entry");
    expect(await readFile(target, "utf8")).toBe("1234");
  });
});

import { lstat, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

export interface CacheLimits {
  maxBytes: number;
  maxFiles: number;
  maxAgeMs: number;
}
export function cacheLimits(values: Partial<CacheLimits> = {}): CacheLimits {
  const limits = {
    maxBytes: values.maxBytes ?? 64 * 1024 * 1024,
    maxFiles: values.maxFiles ?? 4096,
    maxAgeMs: values.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000,
  };
  for (const [name, value] of Object.entries(limits))
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error(`Invalid producer cache ${name}`);
  return limits;
}
const owned = /^0x[0-9a-f]{64}\.(?:request|inspect-request|inspect|[0-9a-f]{64}\.proof)\.json$/;
const proof = /\.[0-9a-f]{64}\.proof\.json$/;

// Run only while holding the serial job slot: no active native process may use these files.
// The directory is operator-owned and must be exclusive to this producer process.
export async function pruneCache(dir: string, limits: CacheLimits, now = Date.now()) {
  const retained: { path: string; size: number; modified: number }[] = [];
  for (const name of await readdir(dir)) {
    if (!owned.test(name)) continue;
    const path = join(dir, name);
    const stat = await lstat(path);
    // Never follow symlinks or recursively remove directories.
    if (!stat.isFile()) throw new Error("Unexpected producer cache entry");
    if (!proof.test(name) || now - stat.mtimeMs >= limits.maxAgeMs) {
      await unlink(path);
    } else retained.push({ path, size: stat.size, modified: stat.mtimeMs });
  }
  retained.sort((a, b) => a.modified - b.modified || a.path.localeCompare(b.path));
  let bytes = retained.reduce((sum, entry) => sum + entry.size, 0);
  let files = retained.length;
  for (const entry of retained) {
    if (bytes <= limits.maxBytes && files <= limits.maxFiles) break;
    await unlink(entry.path);
    bytes -= entry.size;
    files--;
  }
  return { bytes, files };
}

import { writeFile, readFile, lstat } from "node:fs/promises";
// Diagnostic receipts only. They never authorize restoration or reuse of a world.
export async function exclusiveJson(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}
export async function regularJson(path: string, limit = 1024 * 1024) {
  const info = await lstat(path);
  if (!info.isFile() || info.size > limit) throw new Error("Invalid local JSON: " + path);
  return JSON.parse(await readFile(path, "utf8"));
}

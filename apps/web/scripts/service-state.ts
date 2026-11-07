import { resolve } from "node:path";

// Reserve supervisor STATE_DIRECTORY in operator env files. This detects stray
// per-service overrides, not an administrator changing both settings.
export function assertServiceStateDirectory(
  directory: string,
  expected = process.env.STATE_DIRECTORY,
) {
  if (
    expected !== undefined &&
    (!expected || expected.includes(":") || resolve(directory) !== resolve(expected))
  )
    throw new Error("Configured state directory differs from supervisor STATE_DIRECTORY");
}

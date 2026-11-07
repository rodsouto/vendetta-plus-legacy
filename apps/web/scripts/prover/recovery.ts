import { readFile, rename, open, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { keccak256, type Hex } from "viem";

export interface TransactionIO {
  prepare: () => Promise<Hex>;
  broadcast: (raw: Hex) => Promise<unknown>;
  receipt: (hash: Hex) => Promise<"success" | "reverted">;
}
// Persist the signed bytes before sending: a lost RPC response can only cause
// rebroadcast of the same transaction, never another nonce or another advance.
export async function recoverTransaction(file: string, io: TransactionIO, label = "H3") {
  let raw: Hex;
  try {
    const stored: unknown = JSON.parse(await readFile(file, "utf8"));
    if (typeof stored !== "string" || !/^0x(?:[0-9a-f]{2})+$/i.test(stored))
      throw new Error(`Invalid ${label} transaction journal`);
    raw = stored as Hex;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    raw = await io.prepare();
  }
  // Republish even recovered bytes: retrying fsync on a new descriptor after
  // writeback failure alone cannot establish that old cached bytes reached disk.
  const temporaryPath = file + ".tmp-" + randomUUID();
  const temporary = await open(temporaryPath, "wx", 0o600);
  try {
    await temporary.writeFile(JSON.stringify(raw));
    await temporary.sync();
  } finally {
    await temporary.close();
  }
  await rename(temporaryPath, file);
  await syncFile(dirname(file));
  // Already-known, nonce-too-low and a lost send response are all ambiguous.
  // Only a receipt settles the journal. A timeout leaves it available to retry.
  await io.broadcast(raw).catch(() => {});
  const status = await io.receipt(keccak256(raw));
  if (status !== "success" && status !== "reverted")
    throw new Error(`Invalid ${label} transaction receipt`);
  try {
    await rm(file);
    await syncFile(dirname(file));
  } catch (cause) {
    throw Object.assign(
      new Error(`${label} transaction ${status}; journal deletion could not be completed`, {
        cause,
      }),
      { transactionStatus: status },
    );
  }
  if (status !== "success") throw new Error(`${label} transaction reverted`);
}

async function syncFile(path: string) {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

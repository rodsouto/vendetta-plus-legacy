import { readFile, rename, writeFile, rm } from "node:fs/promises";
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
    await writeFile(file + ".tmp", JSON.stringify(raw), { mode: 0o600 });
    await rename(file + ".tmp", file);
  }
  // Already-known, nonce-too-low and a lost send response are all ambiguous.
  // Only a receipt settles the journal. A timeout leaves it available to retry.
  await io.broadcast(raw).catch(() => {});
  const status = await io.receipt(keccak256(raw));
  if (status !== "success" && status !== "reverted")
    throw new Error(`Invalid ${label} transaction receipt`);
  await rm(file);
  if (status !== "success") throw new Error(`${label} transaction reverted`);
}

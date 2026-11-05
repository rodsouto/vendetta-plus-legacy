import { readFile } from "node:fs/promises";
import type { Hex } from "viem";
import { recoverTransaction, type TransactionIO } from "../prover/recovery.js";

export interface KeeperAction {
  functionName: string;
  args: unknown[];
}
export interface KeeperTransactionIO extends Omit<TransactionIO, "prepare"> {
  simulate: (action: KeeperAction) => Promise<void>;
  prepare: (action: KeeperAction) => Promise<Hex>;
}

/** One exclusive journal per signer/Game. A pending send settles before a new action. */
export function keeperTransactions(file: string, io: KeeperTransactionIO) {
  let busy = false;
  async function exclusive(run: () => Promise<void>) {
    if (busy) throw new Error("Keeper transaction operation already running");
    busy = true;
    try {
      await run();
    } finally {
      busy = false;
    }
  }
  async function recover() {
    try {
      await readFile(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    await recoverTransaction(
      file,
      {
        ...io,
        prepare: async () => {
          throw new Error("Missing keeper journal");
        },
      },
      "Keeper",
    );
  }
  return {
    recover: () => exclusive(recover),
    send: (action: KeeperAction) =>
      exclusive(async () => {
        await recover();
        await io.simulate(action);
        await recoverTransaction(file, { ...io, prepare: () => io.prepare(action) }, "Keeper");
      }),
  };
}

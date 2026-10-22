// A mined transaction that reverted is replayed with `call` to name its custom error (B-08): the
// revert data then travels on the RPC error itself, not on a RawContractError like a simulation.
import { describe, expect, it } from "vitest";
import { createPublicClient, custom } from "viem";
import { gameAbi } from "../src/chain/abi.js";
import { revertData, revertName } from "../src/account/signer.js";
import type { Clients } from "../src/chain/config.js";

const BACKLOG = "0x7564d4c1"; // Backlog()
const from = "0x0000000000000000000000000000000000000002";

/** anvil's answer to the replay of a mined reveal that hit Backlog (captured on 2026-10-22). */
function clientsReplaying(data: string): Clients {
  const pub = createPublicClient({
    transport: custom({
      async request({ method }: { method: string }) {
        if (method === "eth_chainId") return "0x7a69";
        if (method === "eth_getTransactionByHash") {
          return {
            hash: "0x" + "11".repeat(32),
            from,
            to: "0x0000000000000000000000000000000000000001",
            input: "0x",
            gas: "0xa68c",
            nonce: "0x0",
            value: "0x0",
            blockHash: "0x" + "22".repeat(32),
            blockNumber: "0x28",
            transactionIndex: "0x0",
            type: "0x2",
          };
        }
        if (method === "eth_call") {
          const e = new Error(`execution reverted: custom error ${data}`);
          throw Object.assign(e, { code: 3, data });
        }
        throw new Error(`unexpected ${method}`);
      },
    }),
  });
  return { public: pub } as unknown as Clients;
}

describe("revert decoding", () => {
  it("finds the data on the RPC error of a replayed call", () => {
    const rpc = Object.assign(new Error("execution reverted"), { code: 3, data: BACKLOG });
    const wrapped = Object.assign(new Error("outer"), {
      cause: Object.assign(new Error("mid"), { cause: rpc }),
    });
    expect(revertData(wrapped)).toBe(BACKLOG);
    expect(revertData(Object.assign(new Error("no data"), { data: "0x" }))).toBeUndefined();
    expect(revertData(new Error("plain"))).toBeUndefined();
  });

  it("names Backlog on a mined transaction", async () => {
    const name = await revertName(clientsReplaying(BACKLOG), "0x" + "11".repeat(32), 40n, gameAbi);
    expect(name).toBe("Backlog");
  });

  it("gives up on data that is not one of the game's errors", async () => {
    const name = await revertName(
      clientsReplaying("0xdeadbeef"),
      "0x" + "11".repeat(32),
      40n,
      gameAbi,
    );
    expect(name).toBeUndefined();
  });
});

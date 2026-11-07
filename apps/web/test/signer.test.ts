// A mined transaction that reverted is replayed with `call` to name its custom error (B-08): the
// revert data then travels on the RPC error itself, not on a RawContractError like a simulation.
// A dev account's call rejected at its gas estimate carries its index: the calls before it landed.
import { describe, expect, it } from "vitest";
import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  createPublicClient,
  custom,
} from "viem";
import { gameAbi } from "../src/chain/abi.js";
import { DevSigner, RevertedError, revertData, revertName } from "../src/account/signer.js";
import { gameCall, sendBehindQueue } from "../src/state/backlog.js";
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

describe("dev account", () => {
  const GAME = "0x0000000000000000000000000000000000000001";
  const train = gameCall(GAME, "train", [1n, 0n, 1n]);

  /** A wallet whose `failAt`-th write is rejected at its gas estimate with Backlog, as viem does. */
  function clientsFailingAt(failAt: number) {
    const sent: string[] = [];
    const gases: bigint[] = [];
    const estimates: unknown[] = [];
    const wallet = {
      chain: undefined,
      account: { address: from },
      async writeContract(c: { functionName: string; args: readonly unknown[]; gas: bigint }) {
        gases.push(c.gas);
        sent.push(c.functionName);
        return "0x" + "33".repeat(32);
      },
    };
    const pub = {
      estimateContractGas: async (request: { functionName: string; args: readonly unknown[] }) => {
        estimates.push(request);
        if (sent.length === failAt) {
          const revert = new ContractFunctionRevertedError({
            abi: gameAbi,
            data: BACKLOG,
            functionName: request.functionName,
          });
          throw new ContractFunctionExecutionError(revert, {
            abi: gameAbi,
            functionName: request.functionName,
            args: request.args,
          });
        }
        return 177518n;
      },
      waitForTransactionReceipt: async () => ({ status: "success", blockNumber: 1n }),
    };
    return {
      clients: { public: pub, wallet: () => wallet } as unknown as Clients,
      sent,
      gases,
      estimates,
    };
  }

  it("adds inclusion headroom to a local estimate before signing", async () => {
    const { clients, gases, estimates } = clientsFailingAt(2);
    await new DevSigner(clients).send([train], "actor");
    expect(gases).toEqual([366277n]);
    expect(estimates).toEqual([
      expect.objectContaining({
        address: GAME,
        functionName: "train",
        args: [1n, 0n, 1n],
        account: { address: from },
      }),
    ]);
  });
  it("does not broadcast after the explicit estimate rejects with Backlog", async () => {
    const { clients, sent, gases } = clientsFailingAt(2);
    clients.public.estimateContractGas = async () => {
      throw new ContractFunctionExecutionError(
        new ContractFunctionRevertedError({ abi: gameAbi, data: BACKLOG, functionName: "train" }),
        { abi: gameAbi, functionName: "train", args: [1n, 0n, 1n] },
      );
    };
    await expect(new DevSigner(clients).send([train], "actor")).rejects.toMatchObject({
      errorName: "Backlog",
      failed: 0,
    });
    expect(sent).toEqual([]);
    expect(gases).toEqual([]);
  });
  it("rounds odd estimate headroom up and preserves a transport failure without broadcasting", async () => {
    const { clients, gases, sent } = clientsFailingAt(2);
    clients.public.estimateContractGas = async () => 173039n;
    await new DevSigner(clients).send([train], "actor");
    expect(gases).toEqual([359559n]);
    const error = new Error("synthetic RPC failure");
    clients.public.estimateContractGas = async () => {
      throw error;
    };
    await expect(new DevSigner(clients).send([train], "actor")).rejects.toBe(error);
    expect(sent).toEqual(["train"]);
  });
  it("names the call rejected at its gas estimate", async () => {
    const { clients, sent, gases } = clientsFailingAt(1);
    const e = await new DevSigner(clients).send([train, train], "actor").catch((x) => x);
    expect(e).toBeInstanceOf(RevertedError);
    expect(e).toMatchObject({ errorName: "Backlog", failed: 1 });
    expect(sent).toEqual(["train"]);
    expect(gases).toEqual([366277n]);
  });

  it("an action that landed before a call rejected with Backlog is not sent again", async () => {
    const { clients, sent } = clientsFailingAt(1);
    const signer = new DevSigner(clients);
    await expect(
      sendBehindQueue({
        world: undefined,
        known: new Map(),
        game: GAME,
        calls: [train, train],
        submit: (c) => signer.send(c, "actor"),
        clock: () => 0n,
      }),
    ).rejects.toMatchObject({ errorName: "Backlog" });
    expect(sent).toEqual(["train"]);
  });
});

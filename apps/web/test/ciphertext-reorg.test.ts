import { spawn } from "node:child_process";
import {
  createPublicClient,
  createWalletClient,
  http,
  concatHex,
  encodeAbiParameters,
  keccak256,
  stringToHex,
  toHex,
  size,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { expect, it, vi } from "vitest";
import { DEV_KEYS } from "../src/chain/config.js";
import { CiphertextIndex } from "../src/chain/hidden.js";

it("replaces orphaned cached packets on shorter/same-height forks and rejects a fork changing during a log query", async () => {
  const node = spawn("anvil", ["--port", "8627", "--silent"], { stdio: "ignore" });
  let spawnError: Error | undefined;
  node.on("error", (error) => {
    spawnError = error;
  });
  const exited = new Promise<void>((done) => node.once("close", () => done()));
  const transport = http("http://127.0.0.1:8627", { retryCount: 0, timeout: 1000 });
  const client = createPublicClient({ transport, cacheTime: 0 });
  const wallet = createWalletClient({ transport, account: privateKeyToAccount(DEV_KEYS[0]) });
  try {
    for (let i = 0; ; i++) {
      if (spawnError) throw spawnError;
      try {
        await client.getChainId();
        break;
      } catch (error) {
        if (i === 100) throw error;
        await new Promise((done) => setTimeout(done, 20));
      }
    }
    // A tiny LOG2 emitter: copy calldata to memory, emit HiddenMissionSent
    // with indexed mission=1 and calldata as ABI-encoded event data. No Game mock
    // state machine: this test concerns canonical RPC log indexing only.
    const topic = keccak256(stringToHex("HiddenMissionSent(uint64,bytes32,uint32,bytes)"));
    const runtime = concatHex(["0x36600060003760017f", topic, "0x366000a200"]);
    const len = toHex(size(runtime), { size: 1 });
    const bytecode = concatHex(["0x60", len, "0x600c60003960", len, "0x6000f3", runtime]);
    const deploy = await client.waitForTransactionReceipt({
      hash: await wallet.deployContract({ abi: [], bytecode, chain: null }),
      pollingInterval: 20,
    });
    expect(deploy.status).toBe("success");
    const address = deploy.contractAddress!;
    const emit = async (packet: Hex) => {
      const hash = await wallet.sendTransaction({
        chain: null,
        to: address,
        data: encodeAbiParameters(
          [{ type: "bytes32" }, { type: "uint32" }, { type: "bytes" }],
          [toHex(0n, { size: 32 }), 2, packet],
        ),
      });
      expect((await client.waitForTransactionReceipt({ hash, pollingInterval: 20 })).status).toBe(
        "success",
      );
    };
    const snapshot = () => client.request({ method: "evm_snapshot" as never });
    const revert = async (id: unknown) => {
      expect(await client.request({ method: "evm_revert" as never, params: [id] as never })).toBe(
        true,
      );
    };
    const index = new CiphertextIndex(client, address, Number(deploy.blockNumber));
    const first = await snapshot();
    await emit("0x1111");
    expect(await index.get(1n)).toBe("0x1111");
    await revert(first);
    expect(await index.get(1n)).toBeNull(); // shorter chain drops the cached packet
    const second = await snapshot();
    await emit("0x2222");
    expect(await index.get(1n)).toBe("0x2222");
    await revert(second);
    const third = await snapshot();
    await emit("0x3333");
    expect(await index.get(1n)).toBe("0x3333"); // same height, different block hash
    await revert(third);
    const fourth = await snapshot();
    await emit("0x4444");
    const fresh = new CiphertextIndex(client, address, Number(deploy.blockNumber));
    const original = client.getContractEvents.bind(client);
    const spy = vi.spyOn(client, "getContractEvents").mockImplementationOnce(async (args) => {
      const logs = await original(args);
      await revert(fourth);
      await emit("0x5555");
      return logs;
    });
    await expect(fresh.get(1n)).rejects.toThrow("reorganized");
    spy.mockRestore();
    expect(await fresh.get(1n)).toBe("0x5555");
    expect(await index.get(1n)).toBe("0x5555");
  } finally {
    node.kill();
    await exited;
  }
}, 15000);

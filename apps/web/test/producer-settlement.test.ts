import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPublicClient, createWalletClient, http, keccak256, parseTransaction } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { expect, it, vi } from "vitest";
import { DEV_KEYS } from "../src/chain/config.js";
import { recoverTransaction } from "../scripts/prover/recovery.js";
import { keeperTransactions } from "../scripts/keeper/transactions.js";
import { producerFaults } from "../scripts/experiments/producer-faults.js";

async function fixture(port: number) {
  const node = spawn("anvil", ["--port", String(port), "--silent"], { stdio: "ignore" });
  let spawnError: Error | undefined;
  node.on("error", (error) => {
    spawnError = error;
  });
  const exited = new Promise<void>((done) => node.once("close", () => done()));
  const dir = await mkdtemp(join(tmpdir(), "producer-settlement-"));
  const rpc = `http://127.0.0.1:${port}`;
  const client = createPublicClient({
    transport: http(rpc, { retryCount: 0, timeout: 1000 }),
    cacheTime: 0,
  });
  const close = async () => {
    node.kill();
    await exited;
    await rm(dir, { recursive: true, force: true });
  };
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
    const wallet = createWalletClient({
      transport: http(rpc),
      account: privateKeyToAccount(DEV_KEYS[0]),
    });
    const prepare = vi.fn(async () => {
      const request = await wallet.prepareTransactionRequest({
        chain: null,
        to: wallet.account.address,
        value: 0n,
      });
      return wallet.signTransaction({ ...request, chain: null });
    });
    return { client, wallet, prepare, file: join(dir, "h3.json"), rpc, close };
  } catch (error) {
    await close();
    throw error;
  }
}

it("keeps the original signed transaction across repeated real pending receipt deadlines until mining resumes", async () => {
  const f = await fixture(8625);
  try {
    const before = await f.client.getTransactionCount({ address: f.wallet.account.address });
    await f.client.request({ method: "evm_setAutomine" as never, params: [false] as never });
    const io = {
      prepare: f.prepare,
      broadcast: (serializedTransaction: `0x${string}`) =>
        f.client.sendRawTransaction({ serializedTransaction }),
      receipt: async (hash: `0x${string}`) =>
        (await f.client.waitForTransactionReceipt({ hash, timeout: 200, pollingInterval: 20 }))
          .status,
    };
    let stored: string | undefined;
    for (let retry = 0; retry < 4; retry++) {
      await expect(recoverTransaction(f.file, io)).rejects.toThrow();
      const current = await readFile(f.file, "utf8");
      stored ??= current;
      expect(current).toBe(stored);
      expect(f.prepare).toHaveBeenCalledTimes(1);
      expect(
        await f.client.getTransactionCount({
          address: f.wallet.account.address,
          blockTag: "latest",
        }),
      ).toBe(before);
      expect(
        await f.client.getTransactionCount({
          address: f.wallet.account.address,
          blockTag: "pending",
        }),
      ).toBe(before + 1);
    }
    await f.client.request({ method: "evm_mine" as never });
    await recoverTransaction(f.file, io);
    expect(f.prepare).toHaveBeenCalledTimes(1);
    expect(await f.client.getTransactionCount({ address: f.wallet.account.address })).toBe(
      before + 1,
    );
    await expect(readFile(f.file)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await f.close();
  }
}, 15000);

it("rebroadcasts the journal after a mined transaction is removed by a chain revert before settlement", async () => {
  const f = await fixture(8626);
  const proxy = await producerFaults(f.rpc, new Map());
  try {
    const client = createPublicClient({
      transport: http(proxy.rpc, { retryCount: 0, timeout: 1000 }),
      cacheTime: 0,
    });
    const before = await f.client.getTransactionCount({ address: f.wallet.account.address });
    const snapshot = await f.client.request({ method: "evm_snapshot" as never });
    const io = {
      prepare: f.prepare,
      broadcast: (serializedTransaction: `0x${string}`) =>
        client.sendRawTransaction({ serializedTransaction }),
      receipt: async (hash: `0x${string}`) =>
        (await client.waitForTransactionReceipt({ hash, timeout: 5000, pollingInterval: 50 }))
          .status,
    };
    proxy.setMode("h3");
    await expect(recoverTransaction(f.file, io)).rejects.toThrow();
    const stored = await readFile(f.file, "utf8");
    const hash = keccak256(JSON.parse(stored) as `0x${string}`);
    expect((await f.client.getTransactionReceipt({ hash })).status).toBe("success");
    expect(
      await f.client.request({ method: "evm_revert" as never, params: [snapshot] as never }),
    ).toBe(true);
    await expect(f.client.getTransactionReceipt({ hash })).rejects.toThrow();
    expect(await f.client.getTransactionCount({ address: f.wallet.account.address })).toBe(before);
    expect(await readFile(f.file, "utf8")).toBe(stored);
    // A canonical chain keeps producing blocks even when the orphaned send
    // was restored to Anvil's mempool before rebroadcast.
    await f.client.request({ method: "evm_mine" as never });
    proxy.setMode("healthy");
    await recoverTransaction(f.file, io);
    expect((await f.client.getTransactionReceipt({ hash })).status).toBe("success");
    expect(f.prepare).toHaveBeenCalledTimes(1);
    expect(await f.client.getTransactionCount({ address: f.wallet.account.address })).toBe(
      before + 1,
    );
    await expect(readFile(f.file)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await proxy.close();
    await f.close();
  }
}, 15000);

it("recovers keeper sends after restart and blocks preparation of the next action until the original nonce settles", async () => {
  const f = await fixture(8628);
  try {
    const before = await f.client.getTransactionCount({ address: f.wallet.account.address });
    await f.client.request({ method: "evm_setAutomine" as never, params: [false] as never });
    const simulate = vi.fn(async () => {});
    const io = {
      simulate,
      prepare: f.prepare,
      broadcast: (serializedTransaction: `0x${string}`) =>
        f.client.sendRawTransaction({ serializedTransaction }),
      receipt: async (hash: `0x${string}`) =>
        (await f.client.waitForTransactionReceipt({ hash, timeout: 200, pollingInterval: 20 }))
          .status,
    };
    const action = { functionName: "submitHiddenEvidence", args: [1n, "0x"] };
    const next = { functionName: "advance", args: [1n] };
    await expect(keeperTransactions(f.file, io).send(action)).rejects.toThrow();
    const stored = await readFile(f.file, "utf8");
    const restarted = keeperTransactions(f.file, io);
    await expect(restarted.send(next)).rejects.toThrow();
    expect(await readFile(f.file, "utf8")).toBe(stored);
    expect(f.prepare).toHaveBeenCalledTimes(1);
    expect(simulate).toHaveBeenCalledTimes(1);
    await f.client.request({ method: "evm_mine" as never });
    await restarted.recover();
    await expect(readFile(f.file)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(restarted.send(next)).rejects.toThrow();
    expect(simulate).toHaveBeenCalledTimes(2);
    expect(f.prepare).toHaveBeenCalledTimes(2);
    expect(await readFile(f.file, "utf8")).not.toBe(stored);
    await f.client.request({ method: "evm_mine" as never });
    await restarted.recover();
    expect(await f.client.getTransactionCount({ address: f.wallet.account.address })).toBe(
      before + 2,
    );
    await expect(readFile(f.file)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await f.close();
  }
}, 15000);

it("keeps an externally replaced nonce blocked and resumes with a separate signer without deleting the old journal", async () => {
  const f = await fixture(8630);
  try {
    await f.client.request({ method: "evm_setAutomine" as never, params: [false] as never });
    const io = {
      prepare: f.prepare,
      broadcast: (serializedTransaction: `0x${string}`) =>
        f.client.sendRawTransaction({ serializedTransaction }),
      receipt: async (hash: `0x${string}`) =>
        (await f.client.waitForTransactionReceipt({ hash, timeout: 200, pollingInterval: 20 }))
          .status,
    };
    await expect(recoverTransaction(f.file, io)).rejects.toThrow();
    const stored = await readFile(f.file, "utf8");
    const raw = JSON.parse(stored) as `0x${string}`;
    const original = parseTransaction(raw);
    const replacement = await f.wallet.sendTransaction({
      chain: null,
      to: f.wallet.account.address,
      nonce: original.nonce,
      value: 1n,
      maxFeePerGas: (original.maxFeePerGas ?? original.gasPrice ?? 1n) * 2n + 1n,
      maxPriorityFeePerGas: (original.maxPriorityFeePerGas ?? 0n) * 2n + 1n,
    });
    await f.client.request({ method: "evm_mine" as never });
    expect((await f.client.getTransactionReceipt({ hash: replacement })).status).toBe("success");
    await expect(f.client.getTransactionReceipt({ hash: keccak256(raw) })).rejects.toThrow();
    const simulate = vi.fn(async () => {});
    const blocked = keeperTransactions(f.file, { ...io, simulate });
    await expect(blocked.send({ functionName: "advance", args: [1n] })).rejects.toThrow();
    expect(await readFile(f.file, "utf8")).toBe(stored);
    expect(simulate).not.toHaveBeenCalled();
    expect(f.prepare).toHaveBeenCalledTimes(1);
    // Explicit operator rotation: a different dedicated signer gets a different
    // journal. The unresolved original is preserved, never silently discarded.
    await f.client.request({ method: "evm_setAutomine" as never, params: [true] as never });
    const wallet = createWalletClient({
      transport: http(f.rpc),
      account: privateKeyToAccount(DEV_KEYS[1]),
    });
    const file = f.file + ".new-signer";
    const rotated = keeperTransactions(file, {
      ...io,
      simulate,
      prepare: async () => {
        const request = await wallet.prepareTransactionRequest({
          chain: null,
          to: wallet.account.address,
          value: 0n,
        });
        return wallet.signTransaction({ ...request, chain: null });
      },
    });
    await rotated.send({ functionName: "advance", args: [1n] });
    expect(simulate).toHaveBeenCalledTimes(1);
    expect(await f.client.getTransactionCount({ address: wallet.account.address })).toBe(1);
    await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(f.file, "utf8")).toBe(stored);
  } finally {
    await f.close();
  }
}, 15000);

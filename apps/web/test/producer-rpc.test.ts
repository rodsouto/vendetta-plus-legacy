import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPublicClient, createWalletClient, http, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { expect, it, vi } from "vitest";
import { DEV_KEYS } from "../src/chain/config.js";
import { serialQueue } from "../scripts/prover/jobs.js";
import { recoverTransaction } from "../scripts/prover/recovery.js";

it("recovers an accepted transaction after receipt RPC failure on real Anvil, spending one nonce", async () => {
  const node = spawn("anvil", ["--port", "8623", "--silent"], { stdio: "ignore" });
  const exited = new Promise<void>((resolve) => {
    node.once("exit", () => resolve());
    node.once("error", () => resolve());
  });
  let spawnError: Error | undefined;
  node.on("error", (error) => {
    spawnError = error;
  });
  const dir = await mkdtemp(join(tmpdir(), "producer-rpc-"));
  try {
    const transport = http("http://127.0.0.1:8623", { retryCount: 0, timeout: 1000 });
    const client = createPublicClient({ transport, cacheTime: 0 });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (spawnError) throw spawnError;
      try {
        await client.getChainId();
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    if (!ready) throw new Error("Anvil unavailable");
    const wallet = createWalletClient({ transport, account: privateKeyToAccount(DEV_KEYS[0]) });
    const prepare = vi.fn(async () => {
      const request = await wallet.prepareTransactionRequest({
        chain: null,
        to: wallet.account.address,
        value: 0n,
      });
      return wallet.signTransaction({ ...request, chain: null });
    });
    const file = join(dir, "h3.json");
    const before = await client.getTransactionCount({ address: wallet.account.address });
    await expect(
      recoverTransaction(file, {
        prepare,
        broadcast: async (raw) => {
          await client.sendRawTransaction({ serializedTransaction: raw });
          throw new Error("lost response");
        },
        receipt: async () => {
          throw new Error("receipt RPC unavailable");
        },
      }),
    ).rejects.toThrow("receipt RPC unavailable");
    await recoverTransaction(file, {
      prepare,
      broadcast: (raw) => client.sendRawTransaction({ serializedTransaction: raw }),
      receipt: async (hash) =>
        (await client.waitForTransactionReceipt({ hash, timeout: 5000, pollingInterval: 50 }))
          .status,
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(await client.getTransactionCount({ address: wallet.account.address })).toBe(before + 1);
    const raw = await prepare.mock.results[0]!.value;
    expect((await client.getTransactionReceipt({ hash: keccak256(raw) })).status).toBe("success");
  } finally {
    node.kill();
    await exited;
    await rm(dir, { recursive: true, force: true });
  }
}, 15000);

// Exercise transport failures on the wire, rather than throwing inside the
// TransactionIO callbacks. The proxy forwards broadcasts before losing replies.
it("drains queued retries across repeated wire outages without changing signed bytes or consuming extra nonces", async () => {
  const chain = spawn("anvil", ["--port", "8624", "--silent"], { stdio: "ignore" });
  const exited = new Promise<void>((done) => {
    chain.once("close", () => done());
    chain.once("error", () => done());
  });
  let spawnError: Error | undefined;
  chain.on("error", (error) => {
    spawnError = error;
  });
  const dir = await mkdtemp(join(tmpdir(), "producer-wire-outage-"));
  let outage = true;
  let lostBroadcasts = 0;
  let blockedReceipts = 0;
  const proxy = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString();
      const rpc = JSON.parse(body) as { method: string };
      if (outage && rpc.method === "eth_getTransactionReceipt") {
        blockedReceipts++;
        res.writeHead(503).end("receipt outage");
        return;
      }
      const upstream = await fetch("http://127.0.0.1:8624", {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(1000),
      });
      const reply = await upstream.text();
      if (outage && rpc.method === "eth_sendRawTransaction") {
        lostBroadcasts++;
        res.destroy();
        return;
      }
      res.writeHead(upstream.status, { "content-type": "application/json" }).end(reply);
    } catch {
      res.destroy();
    }
  });
  try {
    const direct = createPublicClient({
      transport: http("http://127.0.0.1:8624", { retryCount: 0, timeout: 1000 }),
      cacheTime: 0,
    });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (spawnError) throw spawnError;
      try {
        await direct.getChainId();
        ready = true;
        break;
      } catch {
        await new Promise((done) => setTimeout(done, 20));
      }
    }
    if (!ready) throw new Error("Anvil unavailable");
    await new Promise<void>((done) => proxy.listen(0, "127.0.0.1", done));
    const listener = proxy.address();
    if (!listener || typeof listener === "string") throw new Error("Missing proxy listener");
    const transport = http(`http://127.0.0.1:${listener.port}`, { retryCount: 0, timeout: 1000 });
    const client = createPublicClient({ transport, cacheTime: 0 });
    const wallet = createWalletClient({ transport, account: privateKeyToAccount(DEV_KEYS[0]) });
    const queue = serialQueue<void>(8);
    const before = await direct.getTransactionCount({ address: wallet.account.address });
    const prepare = vi.fn(async () => {
      const request = await wallet.prepareTransactionRequest({
        chain: null,
        to: wallet.account.address,
        value: 0n,
      });
      return wallet.signTransaction({ ...request, chain: null });
    });
    const io = {
      prepare,
      broadcast: (raw: `0x${string}`) => client.sendRawTransaction({ serializedTransaction: raw }),
      receipt: async (hash: `0x${string}`) => (await client.getTransactionReceipt({ hash })).status,
    };
    const file = join(dir, "h3.json");
    for (let cycle = 0; cycle < 16; cycle++) {
      outage = true;
      // Eight distinct queued callers all encounter the same unresolved journal.
      const attempts = Array.from({ length: 8 }, (_, i) =>
        queue(`${cycle}-${i}`, () => recoverTransaction(file, io)),
      );
      const failures = await Promise.allSettled(attempts);
      expect(failures.every((result) => result.status === "rejected")).toBe(true);
      expect(prepare).toHaveBeenCalledTimes(cycle + 1);
      const stored = JSON.parse(await readFile(file, "utf8")) as `0x${string}`;
      expect((await direct.getTransactionReceipt({ hash: keccak256(stored) })).status).toBe(
        "success",
      );
      expect(queue.stats().pending).toBe(0);
      outage = false;
      await queue(`recover-${cycle}`, () => recoverTransaction(file, io));
      await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
      expect(prepare).toHaveBeenCalledTimes(cycle + 1);
      expect(await direct.getTransactionCount({ address: wallet.account.address })).toBe(
        before + cycle + 1,
      );
    }
    await queue.drain();
    expect(queue.stats()).toMatchObject({ pending: 0, rejected: 0 });
    expect(lostBroadcasts).toBe(128);
    expect(blockedReceipts).toBe(128);
  } finally {
    proxy.closeAllConnections();
    await new Promise<void>((done) => proxy.close(() => done()));
    chain.kill();
    await exited;
    await rm(dir, { recursive: true, force: true });
  }
}, 60000);

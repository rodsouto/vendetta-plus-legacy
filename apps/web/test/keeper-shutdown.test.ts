import { spawn } from "node:child_process";
import { createServer, type ServerResponse } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";
import { acquireStateLease } from "../scripts/state-lease.js";

it("keeps its lease through an in-flight read and repeated stop signals, then exits without another RPC", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vendetta-keeper-stop-"));
  let pending: { res: ServerResponse; id: number } | undefined;
  let calls = 0;
  const rpc = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    calls++;
    if (body.method === "eth_chainId") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: "0x539" }));
    } else pending = { res, id: body.id };
  });
  await new Promise<void>((resolve) => rpc.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(rpc.address() as { port: number }).port}`;
  const deployment = join(dir, "deployment.json");
  await writeFile(
    deployment,
    JSON.stringify({ chainId: 1337, rpc: url, game: "0x" + "11".repeat(20), fromBlock: 0 }),
  );
  const child = spawn(
    process.execPath,
    [
      "--import",
      fileURLToPath(new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url)),
      fileURLToPath(new URL("../scripts/keeper.ts", import.meta.url)),
      deployment,
    ],
    {
      env: {
        ...process.env,
        RPC_URL: url,
        KEEPER_STATE_DIR: join(dir, "state"),
        KEEPER_PRIVATE_KEY: "0x" + "11".repeat(32),
        HIDDEN_PROVER_URL: url,
        HIDDEN_PROVER_TOKEN: "synthetic-keeper-stop-token-000000",
      },
      stdio: "ignore",
    },
  );
  let exited = false;
  const closed = new Promise<{ code: number | null; signal: string | null }>((resolve) =>
    child.once("close", (code, signal) => {
      exited = true;
      resolve({ code, signal });
    }),
  );
  try {
    await vi.waitFor(() => expect(pending).toBeDefined(), { timeout: 5000 });
    child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 60));
    child.kill("SIGTERM");
    child.kill("SIGHUP");
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(exited).toBe(false);
    await expect(acquireStateLease(join(dir, "state"))).rejects.toThrow("already in use");
    const before = calls;
    pending!.res.setHeader("content-type", "application/json");
    pending!.res.end(JSON.stringify({ jsonrpc: "2.0", id: pending!.id, result: "0x0" }));
    expect(await closed).toEqual({ code: 0, signal: null });
    expect(calls).toBe(before);
    const next = await acquireStateLease(join(dir, "state"));
    await next.release();
  } finally {
    if (!exited) child.kill("SIGKILL");
    await closed;
    rpc.closeAllConnections();
    await new Promise<void>((resolve) => rpc.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
}, 10000);

it("settles an already published journal before stopping and never reads missions afterward", async () => {
  const { mkdir, readFile } = await import("node:fs/promises");
  const { keccak256 } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const dir = await mkdtemp(join(tmpdir(), "vendetta-keeper-published-stop-"));
  const state = join(dir, "state");
  await mkdir(state);
  const key = ("0x" + "11".repeat(32)) as `0x${string}`;
  const account = privateKeyToAccount(key);
  const game = "0x1111111111111111111111111111111111111111";
  const raw = "0x0102" as const; // Synthetic bytes; the RPC fixture performs no EVM execution.
  const hash = keccak256(raw);
  const journal = join(state, `keeper-1337-${game}-${account.address.toLowerCase()}.json`);
  await writeFile(journal, JSON.stringify(raw));
  let receipt: { res: ServerResponse; id: number } | undefined;
  const methods: string[] = [];
  const rpc = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    methods.push(body.method);
    res.setHeader("content-type", "application/json");
    if (body.method === "eth_getTransactionReceipt") {
      receipt = { res, id: body.id };
      return;
    }
    let result: unknown;
    if (body.method === "eth_chainId") result = "0x539";
    else if (body.method === "eth_sendRawTransaction") {
      expect(body.params).toEqual([raw]);
      result = hash;
    } else if (body.method === "eth_blockNumber") result = "0x1";
    else {
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          error: { code: -32000, message: "unexpected fixture method" },
        }),
      );
      return;
    }
    res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
  });
  await new Promise<void>((resolve) => rpc.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(rpc.address() as { port: number }).port}`;
  const deployment = join(dir, "deployment.json");
  await writeFile(deployment, JSON.stringify({ chainId: 1337, rpc: url, game, fromBlock: 0 }));
  const child = spawn(
    process.execPath,
    [
      "--import",
      fileURLToPath(new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url)),
      fileURLToPath(new URL("../scripts/keeper.ts", import.meta.url)),
      deployment,
    ],
    {
      env: {
        ...process.env,
        RPC_URL: url,
        KEEPER_STATE_DIR: state,
        KEEPER_PRIVATE_KEY: key,
        HIDDEN_PROVER_URL: url,
        HIDDEN_PROVER_TOKEN: "synthetic-published-stop-token-0000",
      },
      stdio: "ignore",
    },
  );
  let exited = false;
  const closed = new Promise<{ code: number | null; signal: string | null }>((resolve) =>
    child.once("close", (code, signal) => {
      exited = true;
      resolve({ code, signal });
    }),
  );
  try {
    await vi.waitFor(() => expect(receipt).toBeDefined(), { timeout: 5000 });
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 60));
    child.kill("SIGTERM");
    expect(exited).toBe(false);
    expect(JSON.parse(await readFile(journal, "utf8"))).toBe(raw);
    await expect(acquireStateLease(state)).rejects.toThrow("already in use");
    receipt!.res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id: receipt!.id,
        result: {
          transactionHash: hash,
          transactionIndex: "0x0",
          blockHash: "0x" + "22".repeat(32),
          blockNumber: "0x1",
          from: account.address,
          to: game,
          cumulativeGasUsed: "0x5208",
          gasUsed: "0x5208",
          contractAddress: null,
          logs: [],
          logsBloom: "0x" + "00".repeat(256),
          status: "0x1",
          effectiveGasPrice: "0x1",
          type: "0x2",
        },
      }),
    );
    expect(await closed).toEqual({ code: 0, signal: null });
    expect(methods.filter((m) => m === "eth_sendRawTransaction")).toHaveLength(1);
    expect(methods).not.toContain("eth_call");
    await expect(readFile(journal)).rejects.toMatchObject({ code: "ENOENT" });
    const lease = await acquireStateLease(state);
    await lease.release();
  } finally {
    if (!exited) child.kill("SIGKILL");
    await closed;
    rpc.closeAllConnections();
    await new Promise<void>((r) => rpc.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  }
}, 10000);

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";

it("rejects a competing real keeper before RPC and restarts after its owner is killed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vendetta-keeper-lease-"));
  let chainQueries = 0;
  const rpc = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (body.method === "eth_chainId") chainQueries++;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify(
        body.method === "eth_chainId"
          ? { jsonrpc: "2.0", id: body.id, result: "0x539" }
          : {
              jsonrpc: "2.0",
              id: body.id,
              error: { code: -32000, message: "Fixture: no chain actions" },
            },
      ),
    );
  });
  await new Promise<void>((done) => rpc.listen(0, "127.0.0.1", done));
  const address = rpc.address();
  if (!address || typeof address === "string") throw new Error("Missing RPC fixture");
  const url = `http://127.0.0.1:${address.port}`;
  const deployment = join(dir, "deployment.json");
  await writeFile(
    deployment,
    JSON.stringify({
      chainId: 1337,
      rpc: url,
      game: "0x1111111111111111111111111111111111111111",
      fromBlock: 0,
    }),
  );
  const children: {
    child: ReturnType<typeof spawn>;
    closed: Promise<number | null>;
    output: () => string;
  }[] = [];
  const start = () => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
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
          HIDDEN_PROVER_TOKEN: "synthetic-keeper-lease-token-000000",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout?.on("data", (data) => {
      output += String(data);
    });
    child.stderr?.on("data", (data) => {
      output += String(data);
    });
    const entry = {
      child,
      closed: new Promise<number | null>((done) => child.once("close", done)),
      output: () => output,
    };
    children.push(entry);
    return entry;
  };
  try {
    const first = start();
    await vi.waitFor(() => expect(first.output()).toContain("certificate keeper for"), {
      timeout: 5000,
    });
    expect(chainQueries).toBe(1);
    const second = start();
    expect(await second.closed).not.toBe(0);
    expect(second.output()).toContain("already in use");
    expect(chainQueries).toBe(1);
    first.child.kill("SIGKILL");
    await first.closed;
    const next = start();
    await vi.waitFor(() => expect(next.output()).toContain("certificate keeper for"), {
      timeout: 5000,
    });
    expect(chainQueries).toBe(2);
  } finally {
    for (const { child } of children) child.kill("SIGKILL");
    await Promise.all(children.map(({ closed }) => closed));
    rpc.closeAllConnections();
    await new Promise<void>((done) => rpc.close(() => done()));
    await rm(dir, { recursive: true, force: true });
  }
}, 15000);

it("preserves a real keeper startup error and a synthetic lease-release report", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vendetta-keeper-errors-"));
  const state = join(dir, "state");
  const rpc = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: "0x7a69" }));
  });
  await new Promise<void>((resolve) => rpc.listen(0, "127.0.0.1", resolve));
  const address = rpc.address();
  if (!address || typeof address === "string") throw new Error("No fixture port");
  const url = `http://127.0.0.1:${address.port}`;
  const deployment = join(dir, "deployment.json");
  const preload = join(dir, "preload.mjs");
  await writeFile(
    deployment,
    JSON.stringify({
      chainId: 1337,
      rpc: url,
      game: "0x1111111111111111111111111111111111111111",
      fromBlock: 0,
    }),
  );
  await writeFile(
    preload,
    `import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const close=fs.closeSync;fs.closeSync=function(fd){let path='';try{path=fs.readlinkSync('/proc/self/fd/'+fd);}catch{}const result=close(fd);if(path===${JSON.stringify(join(state, ".vendetta-state.lock"))})throw Object.assign(new Error('synthetic keeper lease report after real close'),{code:'EIO'});return result;};syncBuiltinESMExports();`,
  );
  const child = spawn(
    process.execPath,
    [
      "--import",
      preload,
      "--import",
      "tsx",
      fileURLToPath(new URL("../scripts/keeper.ts", import.meta.url)),
      deployment,
    ],
    {
      env: {
        ...process.env,
        RPC_URL: url,
        KEEPER_STATE_DIR: state,
        KEEPER_PRIVATE_KEY: "0x" + "11".repeat(32),
        HIDDEN_PROVER_URL: url,
        HIDDEN_PROVER_TOKEN: "synthetic-keeper-errors-token-000000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (data) => (output += String(data)));
  child.stderr.on("data", (data) => (output += String(data)));
  const closed = new Promise<number | null>((resolve) => child.once("close", resolve));
  try {
    expect(await closed).not.toBe(0);
    expect(output).toContain("Keeper operation and lease release failed");
    expect(output).toContain("Wrong keeper chain");
    expect(output).toContain('"code":"EIO"');
    expect(output).not.toContain("synthetic keeper lease report after real close");
    const { acquireStateLease } = await import("../scripts/state-lease.js");
    const lease = await acquireStateLease(state);
    await lease.release();
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    await closed;
    rpc.closeAllConnections();
    await new Promise<void>((resolve) => rpc.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
}, 10000);

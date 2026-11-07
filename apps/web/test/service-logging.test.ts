import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { acquireStateLease } from "../scripts/state-lease.js";

it.each(["keeper", "prover"])(
  "does not expose provider credentials on %s startup failure",
  async (name) => {
    const dir = await mkdtemp(join(tmpdir(), "vendetta-service-logging-"));
    let calls = 0;
    const rpc = createServer(async (req, res) => {
      for await (const _ of req) {
      }
      calls++;
      res.writeHead(503).end("synthetic outage");
    });
    await new Promise<void>((r) => rpc.listen(0, "127.0.0.1", r));
    const secret = "synthetic-rpc-key-DO-NOT-LOG";
    const url = `http://127.0.0.1:${(rpc.address() as { port: number }).port}/?api_key=${secret}`;
    const deployment = join(dir, "deployment.json"),
      clients = join(dir, "clients.json"),
      state = join(dir, "state");
    await writeFile(
      deployment,
      JSON.stringify({ chainId: 1337, rpc: url, game: "0x" + "11".repeat(20), fromBlock: 0 }),
    );
    await writeFile(
      clients,
      JSON.stringify([
        {
          token: "synthetic-service-test-token-000000",
          scopes: ["prove", "metrics"],
          requestsPerMinute: 120,
          maxConcurrent: 4,
        },
      ]),
    );
    const child = spawn(
      process.execPath,
      [
        "--import",
        fileURLToPath(new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url)),
        fileURLToPath(new URL(`../scripts/${name}.ts`, import.meta.url)),
        deployment,
      ],
      {
        env: {
          ...process.env,
          RPC_URL: url,
          STATE_DIRECTORY: state,
          KEEPER_STATE_DIR: state,
          KEEPER_PRIVATE_KEY: "0x" + "11".repeat(32),
          HIDDEN_PROVER_URL: url,
          HIDDEN_PROVER_TOKEN: "synthetic-token-DO-NOT-LOG",
          HIDDEN_PROVER_BIN: "unused",
          HIDDEN_PROVER_KEYS: "unused",
          HIDDEN_PROVER_CACHE: state,
          HIDDEN_H3_PRIVATE_KEY: "0x" + "11".repeat(32),
          HIDDEN_PROVER_CLIENTS_FILE: clients,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (data) => (output += data));
    child.stderr.on("data", (data) => (output += data));
    const closed = new Promise<number | null>((r) => child.once("close", r));
    try {
      expect(await closed).toBe(1);
      expect(calls).toBe(1);
      expect(output).toContain("HttpRequestError");
      expect(output).not.toContain(secret);
      expect(output).not.toContain("api_key=");
      expect(output).not.toContain("synthetic-token-DO-NOT-LOG");
      const lease = await acquireStateLease(state);
      await lease.release();
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      await closed;
      rpc.closeAllConnections();
      await new Promise<void>((r) => rpc.close(() => r()));
      await rm(dir, { recursive: true, force: true });
    }
  },
  10000,
);

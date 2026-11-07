// Synthetic RPC/log/view data exercises keeper wiring; no Game execution or proving.
import { spawn } from "node:child_process";
import { createServer, type ServerResponse } from "node:http";
import { mkdtemp, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  encodeAbiParameters,
  encodeFunctionResult,
  decodeFunctionData,
  encodeEventTopics,
  toHex,
} from "viem";
import { expect, it, vi } from "vitest";
import { gameAbi } from "../src/chain/abi.js";
import { hiddenEvidenceParameters } from "../src/chain/hidden-evidence.js";
import { acquireStateLease } from "../scripts/state-lease.js";

it("cancels an in-flight certificate body in the real keeper without signing or broadcasting", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vendetta-keeper-certificate-stop-"));
  const game = "0x1111111111111111111111111111111111111111" as const;
  const hash = ("0x" + "22".repeat(32)) as `0x${string}`,
    statement = ("0x" + "33".repeat(32)) as `0x${string}`;
  const bytes = new Uint8Array(273);
  bytes.set([86, 68, 72, 50]);
  bytes.set(
    Buffer.from("52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971", "hex"),
    4,
  );
  bytes[43] = 1;
  const packet = toHex(bytes);
  const missionOutput = (
    gameAbi.find((entry) => entry.type === "function" && entry.name === "getMission") as {
      outputs: readonly { components: readonly { name: string; type: string }[] }[];
    }
  ).outputs[0]!;
  const mission: Record<string, unknown> = {};
  for (const item of missionOutput.components)
    mission[item.name] =
      item.type === "bool"
        ? false
        : item.type === "bytes32"
          ? statement
          : item.type.includes("[")
            ? Array(Number(item.type.match(/\[(\d+)\]/)![1])).fill(0n)
            : 0n;
  Object.assign(mission, { owner: 1n, origin: 1n, hidden: true, arrival: 1n, seq: 1n });
  const evidence = encodeAbiParameters(hiddenEvidenceParameters, [
    {
      receipt: { statement, arrival: 1, seq: 1n, status: 1, consumed: false, plain: "0x" },
      openingConsumer: game,
      invalidPointConsumer: game,
      cancelled: false,
    },
  ]);
  const block = {
    number: "0x1",
    hash,
    parentHash: "0x" + "00".repeat(32),
    nonce: "0x0000000000000000",
    sha3Uncles: hash,
    logsBloom: "0x" + "00".repeat(256),
    transactionsRoot: hash,
    stateRoot: hash,
    receiptsRoot: hash,
    miner: game,
    difficulty: "0x0",
    totalDifficulty: "0x0",
    extraData: "0x",
    size: "0x0",
    gasLimit: "0x1c9c380",
    gasUsed: "0x0",
    timestamp: "0x77359400",
    transactions: [],
    uncles: [],
    baseFeePerGas: "0x1",
  };
  const log = {
    address: game,
    blockNumber: "0x1",
    blockHash: hash,
    transactionHash: hash,
    transactionIndex: "0x0",
    logIndex: "0x0",
    removed: false,
    topics: encodeEventTopics({
      abi: gameAbi,
      eventName: "HiddenMissionSent",
      args: { mission: 1n },
    }),
    data: encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint32" }, { type: "bytes" }],
      [statement, 0, packet],
    ),
  };
  let proof: ServerResponse | undefined;
  const methods: string[] = [];
  const rpc = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (req.url === "/proof") {
      expect(body.mission).toBe("1");
      proof = res;
      res.writeHead(200, { "content-type": "application/json" });
      res.write('{"certificate":"');
      return;
    }
    methods.push(body.method);
    let result: unknown;
    if (body.method === "eth_chainId") result = "0x539";
    else if (body.method === "eth_blockNumber") result = "0x1";
    else if (body.method === "eth_getBlockByNumber") result = block;
    else if (body.method === "eth_getLogs") result = [log];
    else if (body.method === "eth_call") {
      const { functionName } = decodeFunctionData({ abi: gameAbi, data: body.params[0].data });
      if (functionName === "pendingMissions")
        result = encodeFunctionResult({ abi: gameAbi, functionName, result: [1n] });
      else if (functionName === "getMission")
        result = encodeFunctionResult({ abi: gameAbi, functionName, result: mission as never });
      else if (functionName === "getHiddenEvidence")
        result = encodeFunctionResult({ abi: gameAbi, functionName, result: evidence });
      else throw new Error("unexpected fixture view");
    } else {
      res.writeHead(500).end();
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
  });
  await new Promise<void>((r) => rpc.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(rpc.address() as { port: number }).port}`;
  const deployment = join(dir, "deployment.json"),
    state = join(dir, "state");
  await writeFile(deployment, JSON.stringify({ chainId: 1337, rpc: url, game, fromBlock: 1 }));
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
        STATE_DIRECTORY: state,
        KEEPER_STATE_DIR: state,
        KEEPER_PRIVATE_KEY: "0x" + "11".repeat(32),
        HIDDEN_PROVER_URL: url + "/proof",
        HIDDEN_PROVER_TOKEN: "synthetic-stop-token-000000000000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stderr.on("data", (d) => (output += d));
  child.stdout.on("data", (d) => (output += d));
  let exited = false;
  const closed = new Promise<{ code: number | null; signal: string | null }>((r) =>
    child.once("close", (code, signal) => {
      exited = true;
      r({ code, signal });
    }),
  );
  try {
    await vi.waitFor(() => expect(proof, output).toBeDefined(), { timeout: 5000 });
    await expect(acquireStateLease(state)).rejects.toThrow("already in use");
    child.kill("SIGTERM");
    expect(await closed).toEqual({ code: 0, signal: null });
    await vi.waitFor(() => expect(proof!.destroyed).toBe(true));
    expect(methods).not.toContain("eth_sendRawTransaction");
    expect(methods).not.toContain("eth_estimateGas");
    expect(await readdir(state)).toEqual([".vendetta-state.lock"]);
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

import { fetchBeacon } from "./beacon.js";
import { ProducerWorker } from "./worker.js";
import { producerAccess } from "./access.js";
import { recoverTransaction } from "./recovery.js";
import { producerMetrics } from "./metrics.js";
import { cacheLimits, pruneCache, type CacheLimits } from "./cache.js";
import { serialQueue, runProducer, producerTimeout } from "./jobs.js";
import { validateSetupManifest } from "./setup.js";
import { createHash } from "node:crypto";
// Experimental certificate producer. The configured Game and RPC are operator-owned, never request parameters.
import { producerServer } from "./http.js";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeAbiParameters,
  encodeFunctionData,
  fromHex,
  toHex,
  keccak256,
  parseAbi,
  type Abi,
  type ContractFunctionReturnType,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sim } from "@vendetta/rules";
import { gameAbi } from "../../src/chain/abi.js";
import { decodeHiddenEvidence } from "../../src/chain/hidden-evidence.js";
import { decodePacket } from "../../src/chain/codec.js";
const openingAbi = parseAbi([
  "function begin(bytes32) returns (bytes32)",
  "function verifier() view returns (address)",
  "function prefix() view returns (address)",
  "function check(bytes32,bytes,uint256[55]) view returns (bool,bytes)",
]);
const pointAbi = parseAbi([
  "function verifier() view returns(address)",
  "function check(bytes32,bytes,uint256[2]) view returns (bool)",
]);
const prefixAbi = parseAbi([
  "function contextInitialized(bytes32) view returns (bool)",
  "function receiptForContext(bytes32) view returns (bytes32)",
  "function states(bytes32) view returns (bytes32,uint256,uint32,uint32,uint8)",
  "function advance(bytes32,uint16)",
]);
export interface ProducerConfig {
  clients: unknown;
  rpc: string;
  chainId: number;
  game: Address;
  binary: string;
  openingKeys: string;
  pointKeys: string;
  cache: string;
  h3Key: Hex;
  allowUnsafeLocalSetup?: boolean;
  jobTimeoutMs?: number;
  cacheLimits?: Partial<CacheLimits>;
  beacon?: (round: bigint) => Promise<string>;
}
interface Proof {
  kind: "opening" | "invalid-point";
  statement: Hex;
  proof: Hex;
  publicInputs: string[];
  pre?: Hex;
  elapsedMs: number;
  setupManifestSha256: string;
}
export async function certificateProducer(config: ProducerConfig) {
  const access = producerAccess(config.clients);
  const metrics = producerMetrics();
  const timeout = producerTimeout(config.jobTimeoutMs);
  const retention = cacheLimits(config.cacheLimits);
  const client = createPublicClient({
    transport: http(config.rpc, { timeout: 15000, retryCount: 0 }),
    cacheTime: 0,
  });
  if ((await client.getChainId()) !== config.chainId)
    throw new Error("Producer RPC chain mismatch");
  const setupDigests: Record<string, string> = {};
  for (const [dir, kind] of [
    [config.openingKeys, "opening"],
    [config.pointKeys, "invalid-point"],
  ] as const) {
    const manifest = await readFile(join(dir, "manifest.json"));
    setupDigests[kind] = createHash("sha256").update(manifest).digest("hex");
    const m = JSON.parse(manifest.toString("utf8"));
    validateSetupManifest(m, kind, config.chainId, config.allowUnsafeLocalSetup);
  }
  const consumers = await client.readContract({
    address: config.game,
    abi: gameAbi,
    functionName: "hiddenConsumers",
  });
  const hashes = JSON.parse(
    await readFile(join(config.openingKeys, "..", "verifier-runtime.json"), "utf8"),
  );
  for (const [index, kind] of [
    [0, "opening"],
    [1, "invalid-point"],
  ] as const) {
    const verifier = await client.readContract({
      address: consumers[index],
      abi: pointAbi,
      functionName: "verifier",
    });
    const code = await client.getBytecode({ address: verifier });
    if (
      !code ||
      keccak256(code) !== hashes[kind]?.runtime ||
      setupDigests[kind] !== hashes[kind]?.setup
    )
      throw new Error("Configured consumer does not use this setup verifier");
  }
  await mkdir(config.cache, { recursive: true, mode: 0o700 });
  let cacheUsage = await pruneCache(config.cache, retention);
  const wallet = createWalletClient({
    transport: http(config.rpc, { timeout: 15000, retryCount: 0 }),
    account: privateKeyToAccount(config.h3Key),
  });
  const journal = join(
    config.cache,
    `h3-${config.chainId}-${config.game.toLowerCase()}-${wallet.account.address.toLowerCase()}.json`,
  );
  async function settlePending() {
    try {
      await readFile(journal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    await metrics.measure("h3Recovery", () =>
      recoverTransaction(journal, {
        prepare: async () => {
          throw new Error("Missing H3 journal");
        },
        broadcast: (serializedTransaction) => client.sendRawTransaction({ serializedTransaction }),
        receipt: async (hash) =>
          (await client.waitForTransactionReceipt({ hash, pollingInterval: 1000, timeout: 60000 }))
            .status,
      }),
    );
  }
  const enqueue = serialQueue<Hex>(8);
  const abort = new AbortController();
  let closing = false;
  const assertOpen = () => {
    if (closing) throw new Error("Producer is closing");
  };
  const worker = new ProducerWorker({
    binary: config.binary,
    setups: { opening: config.openingKeys, "invalid-point": config.pointKeys },
    timeoutMs: timeout,
    env: {
      ...process.env,
      GOMAXPROCS: process.env.PROVER_THREADS ?? "8",
      GOMEMLIMIT: process.env.PROVER_MEMORY ?? "6GiB",
    },
  });
  let proofs = 0,
    cacheHits = 0;
  const read = <T>(functionName: string, args: unknown[], blockNumber: bigint) =>
    client.readContract({
      address: config.game,
      abi: gameAbi,
      functionName,
      args,
      blockNumber,
    } as never) as Promise<T>;
  async function write(address: Address, abi: Abi, functionName: string, args: unknown[]) {
    assertOpen();
    await metrics.measure("h3Transaction", () =>
      recoverTransaction(journal, {
        prepare: async () => {
          const request = await wallet.prepareTransactionRequest({
            chain: null,
            chainId: config.chainId,
            to: address,
            data: encodeFunctionData({ abi, functionName, args }),
          });
          return wallet.signTransaction({ ...request, chain: null });
        },
        broadcast: (serializedTransaction) => client.sendRawTransaction({ serializedTransaction }),
        receipt: async (hash) =>
          (
            await client.waitForTransactionReceipt({
              hash,
              pollingInterval: 1000,
              timeout: 60000,
            })
          ).status,
      }),
    );
  }

  async function prefix(consumer: Address, p: Proof, x: bigint[]) {
    const expected = toHex((x[51]! << 128n) | x[52]!, { size: 32 });
    if (p.pre !== expected) throw new Error("Proof/pre mismatch");
    const cache = await client.readContract({
      address: consumer,
      abi: openingAbi,
      functionName: "prefix",
    });
    if (
      !(await client.readContract({
        address: cache,
        abi: prefixAbi,
        functionName: "contextInitialized",
        args: [expected],
      }))
    )
      await write(consumer, openingAbi, "begin", [expected]);
    const receipt = await client.readContract({
      address: cache,
      abi: prefixAbi,
      functionName: "receiptForContext",
      args: [expected],
    });
    for (let i = 0; i <= 512; i++) {
      assertOpen();
      const state = await client.readContract({
        address: cache,
        abi: prefixAbi,
        functionName: "states",
        args: [receipt],
      });
      if (state[4] === 2 || state[4] === 3) {
        if (state[1] !== ((x[53]! << 128n) | x[54]!)) throw new Error("Prefix scalar mismatch");
        return;
      }
      if (i === 512) throw new Error("Prefix completion unavailable; retry");
      await write(cache, prefixAbi, "advance", [receipt, 128]);
    }
  }
  const native: typeof runProducer = (...args) =>
    metrics.measure(args[1][0] === "--inspect-v2" ? "inspect" : "prove", () =>
      runProducer(...args),
    );
  async function generate(body: Record<string, unknown>): Promise<Hex> {
    assertOpen();
    if (
      body.chainId !== config.chainId ||
      typeof body.game !== "string" ||
      body.game.toLowerCase() !== config.game.toLowerCase() ||
      typeof body.mission !== "string" ||
      !/^\d{1,20}$/.test(body.mission) ||
      typeof body.packet !== "string" ||
      !/^0x[0-9a-f]{546}$/i.test(body.packet)
    )
      throw new Error("Invalid request identity/packet");
    const id = BigInt(body.mission);
    if (id < 1n || id >= 1n << 64n) throw new Error("Invalid mission id");
    const block = await metrics.measure("rpcContext", () => client.getBlock());
    const n = block.number;
    const [m, encoded, consumers] = await Promise.all([
      read<ContractFunctionReturnType<typeof gameAbi, "view", "getMission">>("getMission", [id], n),
      read<Hex>("getHiddenEvidence", [id], n),
      read<readonly [Address, Address]>("hiddenConsumers", [], n),
    ]);
    const e = decodeHiddenEvidence(encoded);
    if (!e || e.cancelled || e.receipt.status !== 1 || !m.hidden || m.returning)
      throw new Error("Mission is not awaiting evidence");
    if (
      e.openingConsumer !== consumers[0].toLowerCase() ||
      e.invalidPointConsumer !== consumers[1].toLowerCase()
    )
      throw new Error("Consumer binding mismatch");
    const packet = fromHex(body.packet as Hex, "bytes"),
      p = decodePacket(packet);
    if (!p) throw new Error("Invalid packet");
    if (block.timestamp < 1692803367n + (p.round - 1n) * 3n)
      throw new Error("Beacon release has not arrived");
    const context = sim.hiddenContext.encodeMission(
      {
        owner: m.owner,
        hidden: m.hidden,
        returning: m.returning,
        arrival: BigInt(m.arrival),
        from: {
          city: BigInt(m.fromCity),
          neighborhood: BigInt(m.fromNeighborhood),
          slot: BigInt(m.fromSlot),
        },
        cover: BigInt(m.cover),
        cargo: [...m.cargo],
        commit: m.commit,
      },
      id,
      packet,
      { chainId: BigInt(config.chainId), game: config.game },
    );
    const statement = sim.hiddenContext.digest(context) as Hex;
    if (
      statement !== e.receipt.statement ||
      body.statement !== statement ||
      e.receipt.arrival !== BigInt(m.arrival) ||
      e.receipt.seq !== m.seq
    )
      throw new Error("Stored context/packet mismatch");
    const key = keccak256(toHex(context));
    let artifact: Proof;
    const input = join(config.cache, key + ".request.json"),
      inspectionInput = join(config.cache, key + ".inspect-request.json"),
      inspection = join(config.cache, key + ".inspect.json");
    await writeFile(
      inspectionInput,
      JSON.stringify({ abi: toHex(context), statement, packet: body.packet, signature: "" }),
      { mode: 0o600 },
    );
    await native(config.binary, ["--inspect-v2", inspectionInput, inspection], timeout, {
      maxBuffer: 2 ** 20,
      signal: abort.signal,
    });
    assertOpen();
    const { kind } = JSON.parse(await readFile(inspection, "utf8")) as {
      kind: "opening" | "invalid-point";
    };
    if (kind !== "opening" && kind !== "invalid-point") throw new Error("Unknown producer circuit");
    const output = join(config.cache, key + "." + setupDigests[kind] + ".proof.json");
    try {
      artifact = JSON.parse(await readFile(output, "utf8"));
      cacheHits++;
      metrics.increment("cacheHits");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      const signature =
        kind === "opening"
          ? await metrics.measure("beacon", () => (config.beacon ?? fetchBeacon)(p.round))
          : "";
      await writeFile(
        input,
        JSON.stringify({ abi: toHex(context), statement, packet: body.packet, signature }),
        { mode: 0o600 },
      );
      // Serialized jobs avoid multiple large proving keys/constraint systems resident at once.
      try {
        await metrics.measure("prove", () => worker.run({ circuit: kind, input, output }));
      } catch (error) {
        await rm(output, { force: true });
        throw error;
      }
      artifact = JSON.parse(await readFile(output, "utf8"));
      proofs++;
      metrics.increment("proofs");
    }
    if (
      artifact.setupManifestSha256 !== setupDigests[kind] ||
      artifact.kind !== kind ||
      artifact.statement !== statement ||
      !/^0x[0-9a-f]{768}$/i.test(artifact.proof) ||
      artifact.publicInputs.length !== (kind === "opening" ? 55 : 2)
    )
      throw new Error("Invalid producer artifact");
    assertOpen();
    const x = artifact.publicInputs.map(BigInt);
    if (kind === "opening") {
      await metrics.measure("h3Prefix", () => prefix(consumers[0], artifact, x));
      await client.readContract({
        address: consumers[0],
        abi: openingAbi,
        functionName: "check",
        args: [statement, artifact.proof, x as never],
      });
    } else {
      if (
        !(await client.readContract({
          address: consumers[1],
          abi: pointAbi,
          functionName: "check",
          args: [statement, artifact.proof, x as never],
        }))
      )
        throw new Error("Invalid point certificate rejected");
    }
    const inputs =
      kind === "opening"
        ? encodeAbiParameters([{ type: "uint256[55]" }], [x as never])
        : encodeAbiParameters([{ type: "uint256[2]" }], [x as [bigint, bigint]]);
    return encodeAbiParameters(
      [{ type: "uint8" }, { type: "bytes" }, { type: "bytes" }],
      [kind === "opening" ? 1 : 2, artifact.proof, inputs],
    );
  }
  const server = producerServer(
    async (body) => {
      assertOpen();
      const key = JSON.stringify([
        body.chainId,
        body.game,
        body.mission,
        body.statement,
        body.packet,
      ]);
      metrics.increment("requests");
      return enqueue(key, () =>
        metrics.measure("job", async () => {
          assertOpen();
          cacheUsage = await metrics.measure("cachePrune", () =>
            pruneCache(config.cache, retention),
          );
          try {
            if ((await client.getChainId()) !== config.chainId)
              throw new Error("Producer RPC chain mismatch");
            await settlePending();
            return await generate(body);
          } finally {
            cacheUsage = await metrics.measure("cachePrune", () =>
              pruneCache(config.cache, retention),
            );
          }
        }),
      );
    },
    {
      access,
      metrics: () => ({ ...metrics.snapshot(), queue: enqueue.stats(), cache: { ...cacheUsage } }),
    },
  );
  let shutdown: Promise<void> | undefined;
  const close = () => {
    if (shutdown) return shutdown;
    closing = true;
    abort.abort();
    const httpClosed = new Promise<void>((done) => server.close(() => done()));
    server.closeAllConnections();
    shutdown = Promise.all([httpClosed, worker.close(), enqueue.drain()]).then(() => {});
    return shutdown;
  };
  // Also release a resident worker when an embedding caller closes the listener.
  server.once("close", () => {
    void close().catch(() => {});
  });
  return {
    server,
    close,
    stats: () => ({
      proofs,
      cacheHits,
      ...metrics.snapshot(),
      queue: enqueue.stats(),
      cache: { ...cacheUsage },
    }),
  };
}

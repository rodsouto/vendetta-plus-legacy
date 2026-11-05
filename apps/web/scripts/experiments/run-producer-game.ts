// Real proofs for newly admitted Game contexts, on a fresh private Anvil only.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { isAbsolute, join } from "node:path";
import {
  defineChain,
  createPublicClient,
  createWalletClient,
  http,
  type Abi,
  type Address,
  type Hex,
  toHex,
  keccak256,
  decodeAbiParameters,
  parseAbi,
  decodeFunctionData,
  encodeAbiParameters,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sim, vendetta } from "@vendetta/rules";
import { producerFaults } from "./producer-faults.js";
import { fetchBeacon } from "../prover/beacon.js";
import { benchmarkFetch } from "./producer-benchmark-http.js";
import { producerResources } from "./producer-resources.js";
import { compileProducerVerifiers } from "../prover/compile.js";
import { certificateProducer } from "../prover/service.js";
import { loadWorld } from "../../src/chain/load.js";
import { gameAbi } from "../../src/chain/abi.js";
import { requestCertificate } from "../../src/chain/certificates.js";
import { encryptPacket } from "../../src/chain/codec.js";
import { beacon1000, beacon1001 } from "./opening-fixtures.js";
const soak = process.argv[2] === "--soak";
const faultReplay = process.argv[2] === "--fault-replay";
const soakSeconds = soak ? Number(process.argv[3] ?? 3600) : 0;
const capacity = process.argv[2] === "--capacity" || soak;
const workerReplay = process.argv[2] === "--worker-replay";
if (
  (!soak && process.argv[2] && !capacity && !workerReplay && !faultReplay) ||
  process.argv.length > (soak ? 4 : capacity || workerReplay || faultReplay ? 3 : 2) ||
  (soak && (!Number.isSafeInteger(soakSeconds) || soakSeconds < 3600 || soakSeconds > 86400))
)
  throw new Error(
    "Usage: run-producer-game.ts [--capacity|--worker-replay|--fault-replay|--soak <3600..86400 seconds>]",
  );
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const keys = process.env.HIDDEN_PROVER_KEYS!,
  binary = process.env.HIDDEN_PROVER_BIN!;
if (!keys || !binary) throw new Error("HIDDEN_PROVER_KEYS and HIDDEN_PROVER_BIN required");
const forge = process.env.FORGE_BIN || "/home/rodrigo/.foundry/bin/forge",
  solc = process.env.SOLC_BIN;
const evidenceDirectory = process.env.HIDDEN_PROVER_EVIDENCE_DIR;
if (evidenceDirectory && !isAbsolute(evidenceDirectory))
  throw new Error("HIDDEN_PROVER_EVIDENCE_DIR must be an absolute new directory");
const dir =
  evidenceDirectory ??
  join(
    root,
    "docs/benchmarks/timelock-opening/game-producer",
    ...(soak
      ? ["worker-soak", new Date().toISOString().replace(/[:.]/g, "-")]
      : faultReplay
        ? ["worker-faults", new Date().toISOString().replace(/[:.]/g, "-")]
        : capacity
          ? ["capacity"]
          : workerReplay
            ? ["worker-replay"]
            : []),
  );
mkdirSync(dir, { recursive: !evidenceDirectory });
const work = await compileProducerVerifiers(keys, forge, solc);
const listener = createServer();
await new Promise<void>((r) => listener.listen(0, "127.0.0.1", r));
const port = (listener.address() as any).port;
await new Promise<void>((r) => listener.close(() => r()));
const rpc = `http://127.0.0.1:${port}`,
  chain = defineChain({
    id: 1337,
    name: "Private v2 producer replay",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  });
const anvil = spawn(
  join(forge, "../anvil"),
  [
    "--port",
    String(port),
    "--host",
    "127.0.0.1",
    "--chain-id",
    "1337",
    "--timestamp",
    "1692000000",
    "--hardfork",
    "cancun",
    "--silent",
  ],
  { stdio: "ignore" },
);
const key0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  key9 = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";
const pub = createPublicClient({ chain, transport: http(rpc), cacheTime: 0 }),
  wallet = createWalletClient({ chain, transport: http(rpc), account: privateKeyToAccount(key0) });
let producer: Awaited<ReturnType<typeof certificateProducer>> | undefined;
let faults: Awaited<ReturnType<typeof producerFaults>> | undefined;
let resources: Awaited<ReturnType<typeof producerResources>> | undefined;
const cache = join(keys, (capacity ? "capacity-jobs-" : "game-jobs-") + Date.now());
const receipt = async (hash: Hex) => {
  const r = await pub.waitForTransactionReceipt({ hash, pollingInterval: 20 });
  assert.equal(r.status, "success");
  return r;
};
const artifact = (path: string) =>
  JSON.parse(readFileSync(path, "utf8")) as { abi: Abi; bytecode: { object: Hex } };
const deploy = async (a: ReturnType<typeof artifact>, args: unknown[] = []) =>
  (await receipt(await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode.object, args })))
    .contractAddress!;
try {
  for (let i = 0; ; i++) {
    try {
      assert.equal(await pub.getChainId(), 1337);
      break;
    } catch (e) {
      if (i === 100) throw e;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  console.log("stage: deploy real consumers and Game");
  const openingVerifier = await deploy(artifact(join(work, "out/opening.sol/Verifier.json"))),
    pointVerifier = await deploy(artifact(join(work, "out/invalid-point.sol/Verifier.json")));
  const opening = await deploy(
    artifact(join(root, "contracts/out/MissionV2Consumer.sol/MissionV2Consumer.json")),
    [openingVerifier],
  );
  const point = await deploy(
    artifact(join(root, "contracts/out/InvalidPointV2Consumer.sol/InvalidPointV2Consumer.json")),
    [pointVerifier],
  );
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) =>
        ![
          "ADMIN",
          "OPERATOR",
          "ARBITER",
          "DEPLOYER_PRIVATE_KEY",
          "HIDDEN_OPENING_CONSUMER",
          "HIDDEN_INVALID_POINT_CONSUMER",
        ].includes(k),
    ),
  );
  execFileSync(
    forge,
    [
      "script",
      "script/Deploy.s.sol",
      "--rpc-url",
      rpc,
      "--private-key",
      key0,
      "--broadcast",
      ...(solc ? ["--use", solc] : []),
    ],
    {
      cwd: join(root, "contracts"),
      env: { ...env, HIDDEN_OPENING_CONSUMER: opening, HIDDEN_INVALID_POINT_CONSUMER: point },
      stdio: "pipe",
    },
  );
  const run = JSON.parse(
    readFileSync(join(root, "contracts/broadcast/Deploy.s.sol/1337/run-latest.json"), "utf8"),
  );
  const game = run.transactions.find((t: any) => t.contractName === "ERC1967Proxy")
    .contractAddress as Address;
  const call = async (functionName: string, args: unknown[]) => {
    const request = {
      address: game,
      abi: gameAbi,
      functionName,
      args,
      ...(soak || faultReplay ? { gas: 12000000n } : {}),
    };
    if (soak || faultReplay)
      await pub.simulateContract({ ...request, account: wallet.account.address } as never);
    return receipt(await wallet.writeContract(request as never));
  };
  const jump = async (timestamp: bigint) => {
    await pub.request({
      method: "evm_setNextBlockTimestamp" as never,
      params: [Number(timestamp)] as never,
    });
    await pub.request({ method: "evm_mine" as never });
  };
  await call("register", [1n, 1n, 20n]);
  const bob = createWalletClient({
    chain,
    transport: http(rpc),
    account: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  });
  await receipt(
    await bob.writeContract({
      address: game,
      abi: gameAbi,
      functionName: "register",
      args: [1n, 1n, 2n],
    }),
  );
  await call("queueRoom", [1n, 11n]);
  await jump((await pub.getBlock()).timestamp + 86400n);
  await call("train", [1n, 0n, 7n]);
  await jump((await pub.getBlock()).timestamp + 86400n);
  await call("poke", [1n]);
  const target = { city: 1n, neighborhood: 1n, slot: 2n },
    cargo = [0n, 0n, 0n, 0n],
    troops = vendetta.troops.map((_, i) => (i === 0 ? (capacity ? 1n : 2n) : 0n)),
    salt = (1n << 256n) - 1n;
  const plain = { kind: sim.ATTACK, target, salt };
  const fresh = await encryptPacket(plain, 1001n);
  const vectors = JSON.parse(
    readFileSync(join(root, "docs/benchmarks/timelock-opening/codec-v2/vectors.json"), "utf8"),
  ).vectors;
  const old = Buffer.from(
      vectors.find((v: any) => v.name === "valid-five-candidates").packet,
      "hex",
    ),
    invalidU = Buffer.from(old);
  invalidU[44] = invalidU[44]! & 127;
  const items = [
    {
      id: 1n,
      name: "valid-fresh-packet-round-1001-max-salt",
      packet: toHex(fresh),
      arrival: 1692806352n,
      commit: sim.hiddenCommit(1n, 1, target, salt),
    },
    {
      id: 2n,
      name: "invalid-commitment-five-H3-candidates",
      packet: toHex(old),
      arrival: 1692806349n,
      commit: toHex(0n, { size: 32 }),
    },
    {
      id: 3n,
      name: "invalid-U",
      packet: toHex(invalidU),
      arrival: 1692806349n,
      commit: sim.hiddenCommit(1n, 1, target, 5n),
    },
  ];
  if (capacity) {
    const secondFresh = await encryptPacket(plain, 1001n);
    items.push(
      ...items.slice().map((item, i) => ({
        ...item,
        id: item.id + 3n,
        name: item.name + "-second-mission",
        packet: i === 0 ? toHex(secondFresh) : item.packet,
      })),
    );
  }
  const before = await loadWorld(pub, game),
    duration = sim.previewHiddenMission(
      before.world,
      wallet.account.address.toLowerCase(),
      1n,
      items[0]!.commit,
      2n,
      troops,
      cargo,
      before.chainTime,
    ).duration;
  await jump(1692806349n - duration - 15n);
  const admissionGas: string[] = [];
  for (const item of items) {
    const r = await call("sendHiddenMission", [
      1n,
      item.commit,
      2,
      troops,
      cargo,
      item.packet,
      item.arrival,
    ]);
    admissionGas.push(String(r.gasUsed));
  }
  const admitted = await loadWorld(pub, game);
  assert.equal(admitted.world.hiddenEvidence.size, items.length);
  const sendSnapshot = await pub.request({ method: "evm_snapshot" as never } as never);
  const late = 1692806352n + 7200n;
  await jump(late);
  await call("advance", [20n]);
  assert.equal((await loadWorld(pub, game)).world.missions.size, items.length);
  if (soak || faultReplay)
    faults = await producerFaults(
      rpc,
      new Map([
        ["1000", beacon1000.signature],
        ["1001", beacon1001.signature],
      ]),
    );
  producer = await certificateProducer({
    clients: [
      {
        token: "local-replay-token-0000000000000000",
        scopes: ["prove"],
        requestsPerMinute: 60,
        maxConcurrent: capacity ? 16 : 4,
      },
    ],
    rpc: faults?.rpc ?? rpc,
    chainId: 1337,
    game,
    binary,
    openingKeys: join(keys, "opening"),
    pointKeys: join(keys, "invalid-point"),
    cache,
    h3Key: key9,
    allowUnsafeLocalSetup: true,
    beacon: async (round) => {
      if (faults) return fetchBeacon(round, { baseUrl: faults.beacon });
      if (round === 1000n) return beacon1000.signature;
      if (round === 1001n) return beacon1001.signature;
      throw new Error("Missing offline beacon");
    },
  });
  await new Promise<void>((r) => producer!.server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(producer.server.address() as any).port}/`;
  const body = (item: (typeof items)[number]) => ({
    chainId: 1337,
    game,
    mission: String(item.id),
    packet: item.packet,
    statement: admitted.world.hiddenEvidence.get(item.id)!.receipt.statement,
    context: { owner: "999999" },
  });
  const tampered = { ...body(items[0]!) };
  tampered.packet = items[1]!.packet;
  assert.equal(
    (
      await fetch(url, {
        method: "POST",
        headers: { Authorization: "Bearer local-replay-token-0000000000000000" },
        body: JSON.stringify(tampered),
      })
    ).status,
    503,
  );
  assert.equal(producer.stats().proofs, 0);
  const h3StartBlock = await pub.getBlockNumber();
  const statsBefore = producer.stats();
  if (capacity || workerReplay || faultReplay) resources = await producerResources(binary);
  const batchStart = performance.now();
  const certificates: Hex[] = [],
    measurements = [];
  // Benchmark timeout is extended; normal keeper retries its shorter HTTP timeout without cancelling jobs.
  const benchFetch = benchmarkFetch(
    capacity ? 6 * 900000 + 60000 : workerReplay ? 960000 : 600000,
    "local-replay-token-0000000000000000",
  );
  async function measure(item: (typeof items)[number]) {
    console.log("stage: real certificate", item.name);
    const start = Date.now();
    const certificate = await requestCertificate(url, body(item), benchFetch);
    console.log("stage: certificate ready", item.name, Date.now() - start);
    return {
      name: item.name,
      mission: String(item.id),
      arrival: String(item.arrival),
      statement: body(item).statement,
      certificate,
      elapsedMs: Date.now() - start,
      admissionGas: admissionGas[Number(item.id) - 1]!,
      submissionGas: "pending",
    };
  }
  const faultHistory: unknown[] = [];
  let additionalProofs = 0;
  const assertPending = async () => {
    const world = (await loadWorld(pub, game)).world;
    assert.deepEqual(
      [...world.hiddenEvidence.values()].map((e) => e.receipt.status),
      items.map(() => 1),
    );
    assert.equal(world.missions.size, items.length);
    assert.equal(producer!.stats().queue.pending, 0);
  };
  if (faults) {
    for (const mode of ["rpc", "beacon"] as const) {
      faults.setMode(mode);
      console.log("stage: injected failure", mode);
      const start = performance.now();
      // Distinct HTTP jobs are serialized by the actual producer queue.
      const attempts = mode === "rpc" ? items : [items[0]!, items[0]!, items[0]!];
      let failedRequests = 0;
      do {
        for (const item of attempts) {
          await assert.rejects(requestCertificate(url, body(item), benchFetch), /503/);
          failedRequests++;
        }
        await assertPending();
        assert.equal(producer.stats().proofs, 0);
        if (!faultReplay || performance.now() - start >= 60000) break;
        await new Promise((done) => setTimeout(done, 5000));
      } while (true);
      await assertPending();
      assert.equal(producer.stats().proofs, 0);
      console.log(
        "stage: failure window complete",
        mode,
        failedRequests,
        performance.now() - start,
      );
      faultHistory.push({
        mode,
        failedRequests,
        elapsedMs: performance.now() - start,
        stats: producer.stats(),
        faults: faults.stats(),
      });
    }
    faults.setMode("h3");
    console.log("stage: real proof with ambiguous H3 broadcast");
    const start = performance.now();
    await assert.rejects(requestCertificate(url, body(items[0]!), benchFetch), /503/);
    await assertPending();
    assert.equal(producer.stats().proofs, 1);
    const journals = readdirSync(cache).filter((name) => /^h3-.*\.json$/.test(name));
    assert.equal(journals.length, 1);
    const raw = JSON.parse(readFileSync(join(cache, journals[0]!), "utf8")) as Hex;
    const tx = await pub.getTransactionReceipt({ hash: keccak256(raw) });
    assert.equal(tx.status, "success");
    console.log("stage: H3 journal retained after mined send");
    const retryStart = performance.now();
    let failedRetries = 0;
    if (faultReplay) {
      do {
        await assert.rejects(requestCertificate(url, body(items[0]!), benchFetch), /503/);
        failedRetries++;
        assert.equal(readFileSync(join(cache, journals[0]!), "utf8"), JSON.stringify(raw));
        assert.equal(producer.stats().proofs, 1);
        await assertPending();
        if (performance.now() - retryStart >= 60000) break;
        await new Promise((done) => setTimeout(done, 5000));
      } while (true);
    }
    faultHistory.push({
      mode: "h3-accepted-response-lost",
      elapsedMs: performance.now() - start,
      retryElapsedMs: performance.now() - retryStart,
      failedRetries,
      journalHash: tx.transactionHash,
      stats: producer.stats(),
      faults: faults.stats(),
    });
    faults.setMode("healthy");
    const recovered = await measure(items[0]!);
    assert.equal(readdirSync(cache).filter((name) => /^h3-.*\.json$/.test(name)).length, 0);
    await assertPending();
    faultHistory.push({ mode: "recovered", stats: producer.stats(), faults: faults.stats() });
    measurements.push(recovered);
    certificates.push(recovered.certificate);
    for (const item of items.slice(1)) {
      const result = await measure(item);
      measurements.push(result);
      certificates.push(result.certificate);
    }
  } else if (capacity) {
    // Enqueue each distinct statement with one duplicate while the first proof is running.
    const pairs = await Promise.all(
      items.map(async (item) => {
        const [first, duplicate] = await Promise.all([
          measure(item),
          requestCertificate(url, body(item), benchFetch),
        ]);
        assert.equal(duplicate, first.certificate);
        return first;
      }),
    );
    measurements.push(...pairs);
    certificates.push(...pairs.map((p) => p.certificate));
  } else {
    for (const item of items) {
      const result = await measure(item);
      measurements.push(result);
      certificates.push(result.certificate);
    }
  }
  const soakMeasurements: unknown[] = [];
  if (soak) {
    // Reprove admitted contexts after evicting only their proof artifact. Group
    // jobs by circuit so each circuit has warm witnesses before switching.
    const order = [0, 1, 3, 4, 2, 5];
    let iteration = 0;
    while (performance.now() - batchStart < soakSeconds * 1000) {
      const item = items[order[iteration % order.length]!]!;
      const statement = body(item).statement;
      const files = readdirSync(cache).filter(
        (name) =>
          name.endsWith(".proof.json") &&
          JSON.parse(readFileSync(join(cache, name), "utf8")).statement === statement,
      );
      assert.equal(files.length, 1);
      unlinkSync(join(cache, files[0]!));
      const beforeProofs: number = producer.stats().proofs;
      const [result, duplicate] = await Promise.all([
        measure(item),
        requestCertificate(url, body(item), benchFetch),
      ]);
      assert.equal(result.certificate, duplicate);
      assert.equal(producer.stats().proofs, beforeProofs + 1);
      additionalProofs++;
      await assertPending();
      const artifact = JSON.parse(readFileSync(join(cache, files[0]!), "utf8"));
      certificates[Number(item.id) - 1] = result.certificate;
      measurements[Number(item.id) - 1]!.certificate = result.certificate;
      soakMeasurements.push({
        iteration,
        mission: result.mission,
        circuit: artifact.kind,
        elapsedMs: result.elapsedMs,
        nativeElapsedMs: artifact.elapsedMs,
        artifactsReused: artifact.artifactsReused,
        profileMs: artifact.profileMs,
      });
      writeFileSync(
        join(dir, "soak-progress.json"),
        JSON.stringify(
          {
            elapsedMs: performance.now() - batchStart,
            minimumSeconds: soakSeconds,
            additionalProofs,
            measurements: soakMeasurements,
            stats: producer.stats(),
            faultHistory,
          },
          null,
          2,
        ) + "\n",
      );
      iteration++;
    }
  }
  const expectedProofs = items.length + additionalProofs;
  const batchElapsedMs = performance.now() - batchStart;
  const resourceReport = await resources?.stop();
  resources = undefined;
  const statsAfter = producer.stats();
  const h3EndBlock = await pub.getBlockNumber();
  const h3Transactions = [];
  if (capacity) {
    const h3Abi = parseAbi(["function begin(bytes32)", "function advance(bytes32,uint16)"]);
    for (let blockNumber = h3StartBlock + 1n; blockNumber <= h3EndBlock; blockNumber++) {
      const block = await pub.getBlock({ blockNumber, includeTransactions: true });
      for (const tx of block.transactions) {
        if (
          typeof tx === "string" ||
          tx.from.toLowerCase() !== privateKeyToAccount(key9).address.toLowerCase()
        )
          continue;
        const r = await pub.getTransactionReceipt({ hash: tx.hash });
        assert.equal(r.status, "success");
        const decoded = decodeFunctionData({ abi: h3Abi, data: tx.input });
        h3Transactions.push({
          function: decoded.functionName,
          contextOrReceipt: decoded.args[0],
          gasUsed: String(r.gasUsed),
        });
      }
    }
  }
  const certParams = [{ type: "uint8" }, { type: "bytes" }, { type: "bytes" }] as const;
  const [kind, proof, inputBytes] = decodeAbiParameters(certParams, certificates[0]!);
  const [validInputs] = decodeAbiParameters([{ type: "uint256[55]" }], inputBytes);
  assert.equal(validInputs[50], 1n);
  const altered = [...validInputs];
  altered[50] = 0n;
  const forged = encodeAbiParameters(certParams, [
    kind,
    proof,
    encodeAbiParameters([{ type: "uint256[55]" }], [altered as never]),
  ]);
  for (const certificate of [forged, certificates[2]!]) {
    await assert.rejects(
      pub.simulateContract({
        address: game,
        abi: gameAbi,
        functionName: "submitHiddenEvidence",
        args: [1n, certificate],
      }),
    );
    const hash = await wallet.writeContract({
      address: game,
      abi: gameAbi,
      functionName: "submitHiddenEvidence",
      args: [1n, certificate],
      gas: 3000000n,
    });
    assert.equal(
      (await pub.waitForTransactionReceipt({ hash, pollingInterval: 20 })).status,
      "reverted",
    );
  }
  assert.equal((await loadWorld(pub, game)).world.hiddenEvidence.get(1n)!.receipt.status, 1);
  for (const [i, item] of items.entries()) {
    const r = await call("submitHiddenEvidence", [item.id, certificates[i]!]);
    measurements[i]!.submissionGas = String(r.gasUsed);
  }
  const resolvedInputs = await loadWorld(pub, game);
  assert.deepEqual(
    [...resolvedInputs.world.hiddenEvidence.values()].map((e) => e.receipt.status),
    capacity ? [2, 3, 3, 2, 3, 3] : [2, 3, 3],
  );
  await call("advance", [20n]);
  const delayed = await loadWorld(pub, game);
  assert.equal(delayed.world.missions.size, 0);
  assert.equal(producer.stats().proofs, expectedProofs);
  assert.equal(
    await pub.request({ method: "evm_revert" as never, params: [sendSnapshot] as never }),
    true,
  );
  await jump(1692806352n + 15n);
  for (const [i, item] of items.entries()) {
    const cached = await requestCertificate(url, body(item), benchFetch);
    assert.equal(cached, certificates[i]);
    await call("submitHiddenEvidence", [item.id, cached]);
  }
  await call("advance", [20n]);
  await jump(late + 60n);
  await call("advance", [20n]);
  const punctual = await loadWorld(pub, game);
  assert.deepEqual(punctual.world, delayed.world);
  assert.equal(producer.stats().proofs, expectedProofs);
  assert.equal(producer.stats().cacheHits, items.length + (faults ? 1 : 0));
  writeFileSync(
    join(dir, "certificates.json"),
    JSON.stringify(
      {
        scope: "Real new-Game-context Groth16 certificates on private Anvil, local unsafe setup",
        game,
        chainId: 1337,
        openingConsumer: opening,
        invalidPointConsumer: point,
        measurements,
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    join(dir, "results.json"),
    JSON.stringify(
      {
        scope:
          "Real certificate producer HTTP -> actual Game admission -> receipt -> historical queue; no mocks",
        unsafeLocalSetup: true,
        realNetworkDeployment: false,
        newlyAdmittedMissions: items.length,
        freshBrowserPacketRound: 1001,
        maxSaltPreserved: true,
        nonzeroSourceRow: true,
        lateEvidenceSeconds: 7200,
        punctualAndDelayedFullWorldEqual: true,
        proofsGenerated: producer.stats().proofs,
        proofCacheHits: producer.stats().cacheHits,
        cacheRecheckedAndH3RestoredAfterAnvilRevert: true,
        tamperedRequestRejectedBeforeProving: true,
        forgedInvalidityFlagRejectedWithoutChangingReceipt: true,
        crossMissionInvalidityProofRejected: true,
        benchmarkHttpTimeoutMs: capacity ? 6 * 900000 + 60000 : workerReplay ? 960000 : 600000,
        setupPerMission: false,
      },
      null,
      2,
    ) + "\n",
  );
  if (capacity && !soak) {
    const artifacts = readdirSync(cache)
      .filter((f) => f.endsWith(".proof.json"))
      .map(
        (f) =>
          JSON.parse(readFileSync(join(cache, f), "utf8")) as {
            kind: string;
            artifactsReused: boolean;
            statement: Hex;
            elapsedMs: number;
            profileMs?: Record<string, number>;
            setupManifestSha256: string;
          },
      );
    assert.equal(artifacts.length, items.length);
    assert.equal(statsAfter.proofs - statsBefore.proofs, items.length);
    assert.equal(statsAfter.cacheHits - statsBefore.cacheHits, 0);
    assert.equal(statsAfter.queue.deduplicated - statsBefore.queue.deduplicated, items.length);
    assert.equal(statsAfter.queue.pending, 0);
    assert.equal(resourceReport?.peakNativeProcesses, 1);
    assert.equal(resourceReport.native.length, artifacts.filter((a) => !a.artifactsReused).length);
    assert.equal(producer.stats().queue.pending, 0);
    const nativeMeasurements = measurements.map((m) => {
      const a = artifacts.find((a) => a.statement === m.statement)!;
      assert(a);
      return {
        name: m.name,
        mission: m.mission,
        circuit: a.kind,
        artifactsReused: a.artifactsReused,
        nativeElapsedMs: a.elapsedMs,
        nativeProfileMs: a.profileMs,
        queuedHttpElapsedMs: m.elapsedMs,
        admissionGas: m.admissionGas,
        submissionGas: m.submissionGas,
        setupManifestSha256: a.setupManifestSha256,
      };
    });
    writeFileSync(
      join(dir, "capacity-results.json"),
      JSON.stringify(
        {
          scope:
            "Six distinct real proofs, twelve concurrent authenticated HTTP requests, serial native prover, real H3 and private Anvil RPC; archived authenticated drand signatures; unsafe local setup.",
          date: new Date().toISOString(),
          config: {
            threads: process.env.PROVER_THREADS ?? "8",
            goMemoryLimit: process.env.PROVER_MEMORY ?? "6GiB",
            uniqueMissions: items.length,
            httpRequests: items.length * 2,
          },
          batchElapsedMs,
          observedMissionsPerHour: (items.length * 3600000) / batchElapsedMs,
          measurements: nativeMeasurements,
          resources: resourceReport,
          h3: {
            transactions: h3Transactions,
            totalGas: String(h3Transactions.reduce((sum, t) => sum + BigInt(t.gasUsed), 0n)),
          },
          statsBefore,
          statsAfter,
          finalStats: producer.stats(),
          limitations: [
            "Finite local batch, not a production capacity guarantee or prolonged soak.",
            "Queued HTTP duration includes preceding jobs; native elapsed includes artifact integrity, key loading, witness, proving and local verification.",
            "H3 prefix contexts may be shared across missions. Aggregate observed H3 gas is not an independent per-mission upper bound.",
            "Gas excludes verifier/Game deployment; fee in wei equals gas times operator-selected gas price. Anvil fees do not estimate live network prices.",
            "No public beacon availability, network latency, stuck-transaction or deep reorg recovery measurement.",
          ],
        },
        null,
        2,
      ) + "\n",
    );
  }
  if (soak) {
    assert(batchElapsedMs >= soakSeconds * 1000);
    assert.equal(resourceReport?.peakNativeProcesses, 1);
    assert(soakMeasurements.length >= 2);
    assert.equal(statsAfter.queue.pending, 0);
    assert(faults!.stats().lostBroadcastReplies >= 1);
    assert(faults!.stats().receiptsRejected >= 1);
    writeFileSync(
      join(dir, "soak-results.json"),
      JSON.stringify(
        {
          scope:
            "One-hour-or-longer private Anvil producer soak, six admitted contexts, repeated uncached Groth16 proofs, both circuits, archived authentic beacon signatures served over local HTTP, real H3 and injected RPC/beacon/ambiguous-H3 failures; unsafe local setups",
          date: new Date().toISOString(),
          minimumSeconds: soakSeconds,
          batchElapsedMs,
          additionalProofs,
          proofsGenerated: expectedProofs,
          faultHistory,
          faults: faults!.stats(),
          measurements: soakMeasurements,
          resources: resourceReport,
          statsBefore,
          statsAfter,
          finalStats: producer.stats(),
          punctualAndDelayedFullWorldEqual: true,
          limitations: [
            "Six distinct admitted contexts are reproved repeatedly; not an arrival-rate or production-capacity benchmark.",
            "Local HTTP archived beacon signatures; no public beacon/RPC availability measurement.",
            "Fault episodes precede the sustained proof loop; not every interleaving of faults and circuit switches.",
            "Sampled RSS/CPU are observations, not memory limits or absence-of-leak proof.",
            "No stuck-transaction replacement policy or deep reorg recovery claim.",
          ],
        },
        null,
        2,
      ) + "\n",
    );
  }
  if (faultReplay) {
    for (const history of faultHistory as {
      mode: string;
      elapsedMs?: number;
      retryElapsedMs?: number;
    }[]) {
      if (history.mode === "rpc" || history.mode === "beacon") assert(history.elapsedMs! >= 60000);
      if (history.mode === "h3-accepted-response-lost") assert(history.retryElapsedMs! >= 60000);
    }
    assert.equal(resourceReport?.peakNativeProcesses, 1);
    assert.equal(resourceReport.native.length, 2);
    writeFileSync(
      join(dir, "fault-results.json"),
      JSON.stringify(
        {
          scope:
            "Sustained one-minute-or-longer RPC/beacon/H3 receipt failures, real integrated producer, three new Groth16 certificates and real Game/H3 on private Anvil; unsafe local setups",
          date: new Date().toISOString(),
          minimumFailureWindowMs: 60000,
          batchElapsedMs,
          proofsGenerated: producer.stats().proofs,
          faultHistory,
          faults: faults!.stats(),
          resources: resourceReport,
          statsBefore,
          statsAfter,
          finalStats: producer.stats(),
          punctualAndDelayedFullWorldEqual: true,
          limitations: [
            "Bounded local fault windows, not days of outage or public-provider failover.",
            "Authentic archived beacon signatures over local HTTP; remote availability is observed separately.",
            "H3 send was mined before its response was lost; mempool-stuck and deep reorg policy are separate stage-4 histories.",
            "No process power-loss or parent SIGKILL/cgroup lifecycle claim.",
          ],
        },
        null,
        2,
      ) + "\n",
    );
  }
  if (workerReplay) {
    const artifacts = readdirSync(cache)
      .filter((f) => f.endsWith(".proof.json"))
      .map((f) => JSON.parse(readFileSync(join(cache, f), "utf8")));
    assert.equal(artifacts.length, 3);
    assert.equal(artifacts.filter((a) => a.artifactsReused).length, 1);
    assert.equal(resourceReport?.peakNativeProcesses, 1);
    assert.equal(resourceReport.native.length, 2);
    assert.equal(producer.stats().queue.pending, 0);
    writeFileSync(
      join(dir, "worker-results.json"),
      JSON.stringify(
        {
          scope:
            "Integrated resident worker HTTP producer, three new Groth16 certificates, both circuits, real EVM/H3 on private Anvil; archived authenticated beacon signatures; unsafe local setups.",
          date: new Date().toISOString(),
          batchElapsedMs,
          resources: resourceReport,
          measurements: measurements.map((m) => {
            const a = artifacts.find((a) => a.statement === m.statement);
            assert(a);
            return {
              name: m.name,
              circuit: a.kind,
              artifactsReused: a.artifactsReused,
              nativeElapsedMs: a.elapsedMs,
              profileMs: a.profileMs,
              setupManifestSha256: a.setupManifestSha256,
            };
          }),
          statsBefore,
          statsAfter,
          finalStats: producer.stats(),
          limitations: [
            "Short local replay, not prolonged load or remote RPC/beacon availability.",
            "One sample of invalid-point; no warm invalid-point job.",
            "Cache replay reconstructs H3 after Anvil revert; no stuck-transaction or deep-reorg recovery claim.",
          ],
        },
        null,
        2,
      ) + "\n",
    );
  }
  console.log("Real certificates verified; delayed and punctual Game worlds match");
} finally {
  await resources?.stop();
  await producer?.close();
  await faults?.close();
  anvil.kill();
}

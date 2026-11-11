// Explicitly gated real-time acceptance. Default mode is offline preflight only.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  decodeEventLog,
  decodeAbiParameters,
  encodeAbiParameters,
  toHex,
  type Hex,
} from "viem";
import { sim, vendetta } from "@vendetta/rules";
import { loadWorld } from "../../src/chain/load.js";
import { gameAbi } from "../../src/chain/abi.js";

import { loadLocalStackConfig, sha256File } from "../local-hidden/config.js";
import { scaledSeconds } from "../local-hidden/acceptance-clock.js";
import { startLocalHiddenStack } from "../local-hidden/stack.js";
import { encodePlainV2 } from "./codec-v2.js";
import { benchmarkFetch } from "./producer-benchmark-http.js";
import { negativeCases, faultCases, preparePacket } from "./negative-v2-cases.js";
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const [mode, previousConfig, out, approval, scaleFlag, selection, ...extra] = process.argv.slice(2);
if (
  !["preflight", "run"].includes(mode ?? "") ||
  !previousConfig ||
  !out ||
  !isAbsolute(out) ||
  extra.length ||
  (selection !== undefined && selection !== "--opening-cases-only") ||
  (scaleFlag !== undefined && !/^--time-scale=(1|100)$/.test(scaleFlag)) ||
  (mode !== "run" && (scaleFlag !== undefined || selection !== undefined)) ||
  (mode === "run" ? approval !== "--approved-new-anvil-and-proofs" : approval !== undefined)
)
  throw new Error(
    "Usage: run-negative-v2.ts preflight|run /absolute/previous-config.json /absolute/new-evidence-dir [--approved-new-anvil-and-proofs [--time-scale=100 [--opening-cases-only]]]",
  );
const selectedCases = selection
  ? negativeCases.filter((name) => !name.startsWith("u-"))
  : negativeCases;
const timeScale = Number(scaleFlag?.split("=")[1] ?? 1);
process.umask(0o077);
if (existsSync(out)) throw new Error("Evidence directory must be new; no reuse");
mkdirSync(out, { mode: 0o700 });
const serialize = (value: unknown) =>
  JSON.stringify(
    value,
    (_, v) =>
      typeof v === "bigint"
        ? v.toString()
        : v instanceof Map
          ? { map: [...v] }
          : v instanceof Set
            ? { set: [...v] }
            : v instanceof Uint8Array
              ? { bytes: toHex(v) }
              : v,
    2,
  ) + "\n";
const save = (file: string, value: unknown) => writeFileSync(join(out, file), serialize(value));
const results: { name: string; status: string; detail?: string }[] = [
  ...negativeCases,
  ...faultCases,
].map((name) => ({ name, status: "NO EJECUTADO" }));
const stop = new AbortController();
const abort = () => stop.abort(new Error("Acceptance interrupted"));
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, abort);
let stack: Awaited<ReturnType<typeof startLocalHiddenStack>> | undefined;
let fault = "healthy";
let injectedFaults = 0;
const transcript: unknown[] = [];
let current: string | undefined;
const sleep = async (ms: number) => {
  stop.signal.throwIfAborted();
  await delay(ms, undefined, { signal: stop.signal });
};
const fetchAuthenticBeacon = async (round: bigint) => {
  const url = `https://api.drand.sh/${sim.hiddenContext.NETWORK}/public/${round}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { stdout } = await promisify(execFile)(
        "curl",
        ["--fail", "--silent", "--show-error", "--max-time", "15", url],
        { timeout: 20000, maxBuffer: 4096, signal: stop.signal },
      );
      const data = JSON.parse(stdout);
      assert(
        Number.isSafeInteger(data.round) && BigInt(data.round) === round,
        "Beacon round mismatch",
      );
      assert(
        typeof data.signature === "string" && /^[0-9a-f]{96}$/i.test(data.signature),
        "Malformed authentic beacon",
      );
      save(`drand-response-${round}.json`, {
        url,
        fetchedAt: new Date().toISOString(),
        response: data,
      });
      return data.signature as string;
    } catch (error) {
      save(`drand-transport-${round}-attempt-${attempt}.json`, {
        error: String(error),
        retryable: true,
        infrastructureFailureIsInvalid: false,
      });
      stop.signal.throwIfAborted();
      if (attempt === 3) throw error;
      await sleep(2000);
    }
  }
  throw new Error("Missing authentic beacon");
};
try {
  const config = JSON.parse(readFileSync(previousConfig, "utf8"));
  config.openingKeys =
    "/home/rodrigo/.cache/vendetta-audit/local-mpc-staged-sequence-20261105-run3/23-phase2-keys/public";
  config.pointKeys =
    "/home/rodrigo/.cache/vendetta-audit/local-mpc-sequence-20261104-run2/22-phase2-keys/public";
  const configPath = join(out, "config.json");
  save("config.json", config);
  const checked = await loadLocalStackConfig(configPath, join(out, "session"), root);
  const pins: Record<string, string> = {};
  for (const dir of [checked.openingKeys, checked.pointKeys]) {
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    for (const [name, expected] of Object.entries(manifest.sha256)) {
      assert(["Verifier.sol", "circuit.bin", "proving.key", "verifying.key"].includes(name));
      const file = join(dir, name);
      pins[file] = await sha256File(file);
      assert.equal(pins[file], expected, "Original artifact pin mismatch: " + file);
    }
  }
  save("pins.json", {
    binary: checked.binarySha256,
    openingManifest: checked.openingManifestSha256,
    pointManifest: checked.pointManifestSha256,
    runtime: checked.runtimeSha256,
    files: pins,
  });
  save("source.json", {
    head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    diffSha256: createHash("sha256")
      .update(execFileSync("git", ["diff", "HEAD", "--"], { cwd: root }))
      .digest("hex"),
    status: execFileSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" }),
    patchSha256: await sha256File(join(root, "hidden-v2-negative-regressions.patch")),
    harnessSha256: await sha256File(fileURLToPath(import.meta.url)),
    pointVectorsSha256: await sha256File(
      join(root, "docs/benchmarks/timelock-opening/invalid-point/vectors.json"),
    ),
    casesSha256: await sha256File(fileURLToPath(new URL("negative-v2-cases.ts", import.meta.url))),
    mode,
    selectedCases,
    wallTime: new Date().toISOString(),
    submission: "harness",
    browser: "observation only",
    unsafeLocalSetup: true,
    gameTimeScale: timeScale,
    unmodifiedGameTimingAcceptance: timeScale === 1,
  });
  save("preflight.json", {
    status: "PASS",
    nativeExecuted: false,
    setupGenerated: false,
    pinsVerified: true,
  });
  if (mode === "run") {
    await fetchAuthenticBeacon((BigInt(Math.floor(Date.now() / 1000)) - 1692803367n) / 3n);
    // The flag records prior user approval; it is not permission to self-authorize a run.
    stack = await startLocalHiddenStack(configPath, join(out, "session"), stop.signal, false, {
      timeScale,
      beacon: async (round) => {
        const signature = await fetchAuthenticBeacon(
          fault === "wrong-round-signature" ? round - 1n : round,
        );
        if (fault !== "healthy") injectedFaults++;
        save(`beacon-${round}-${fault}.json`, {
          requestedRound: round,
          sourceRound: fault === "wrong-round-signature" ? round - 1n : round,
          signature,
          fetchedAt: new Date().toISOString(),
        });
        if (fault === "beacon-unavailable") throw new Error("Injected recoverable beacon outage");
        return fault === "fake-signature" ? "00".repeat(48) : signature;
      },
    });
    void stack.failure.catch((error) => stop.abort(error));
    if (timeScale !== 1)
      save(
        "acceptance-clock.json",
        JSON.parse(readFileSync(join(out, "session/acceptance-clock.json"), "utf8")),
      );
    const { deployment } = stack.summary;
    const chain = defineChain({
      id: 31337,
      name: "Negative acceptance",
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [deployment.rpc] } },
    });
    const pub = createPublicClient({ chain, transport: http(deployment.rpc), cacheTime: 0 });
    const wallet = createWalletClient({
      chain,
      transport: http(deployment.rpc),
      account: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const,
    });
    const owner = wallet.account.address.toLowerCase();
    const game = deployment.game;
    const call = async (label: string, functionName: string, args: unknown[]) => {
      stop.signal.throwIfAborted();
      const hash = await wallet.writeContract({
        address: game,
        abi: gameAbi,
        functionName,
        args,
        gas: 12000000n,
      } as never);
      const receipt = await pub.waitForTransactionReceipt({ hash });
      save(`${label}-receipt.json`, receipt);
      transcript.push({
        label,
        functionName,
        hash,
        status: receipt.status,
        at: new Date().toISOString(),
      });
      assert.equal(receipt.status, "success", functionName);
      return receipt;
    };
    const world = async (label: string) => {
      const snapshot = await loadWorld(pub, game);
      save(`${label}-world.json`, snapshot);
      return snapshot;
    };
    const waitUntil = async (timestamp: bigint) => {
      while ((await pub.getBlock()).timestamp < timestamp) {
        console.log("waiting real time until", timestamp.toString());
        await sleep(
          Math.min(
            30000,
            Math.max(1000, Number(timestamp - BigInt(Math.floor(Date.now() / 1000))) * 1000),
          ),
        );
      }
    };
    await call("register-origin", "register", [25n, 25n, 99n]);
    const bob = createWalletClient({
      chain,
      transport: http(deployment.rpc),
      account: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    });
    const bobReceipt = await pub.waitForTransactionReceipt({
      hash: await bob.writeContract({
        address: game,
        abi: gameAbi,
        functionName: "register",
        args: [25n, 25n, 100n],
      }),
    });
    save("register-target-receipt.json", bobReceipt);
    assert.equal(bobReceipt.status, "success");
    // Natural construction/training; no storage injection or accelerated clock.
    await call("queue-training-room", "queueRoom", [1n, 11n]);
    let s = await world("room-queued");
    await waitUntil(s.world.buildings.get(1n)!.roomQueue[0]!.finishAt);
    await call("settle-training-room", "poke", [1n]);
    await call("train", "train", [1n, 0n, 1n]);
    s = await world("training");
    const batch = s.world.buildings.get(1n)!.training.flat()[0]!;
    await waitUntil(batch.finishAt);
    await call("settle-training", "poke", [1n]);
    const troops = vendetta.troops.map((_, i) => (i === 0 ? 1n : 0n));
    let testedFaults = false;
    const proofFetch = benchmarkFetch(30 * 60 * 1000, stack.token, stop.signal);
    for (const name of selectedCases) {
      current = name;
      console.log("acceptance case", name);
      transcript.push({ case: name, at: new Date().toISOString() });
      let before = await world(`${name}-before`);
      await waitUntil(
        before.world.buildings.get(1n)!.lastTroopArrival + vendetta.config.troopArrivalCooldown,
      );
      before = await world(`${name}-ready`);
      const origin = before.world.buildings.get(1n)!.coord;
      // Reserve time for packet construction and mining within admission slack.
      const dummy = await preparePacket(name, 1000n, 1n, origin);
      const preview = sim.previewHiddenMission(
        before.world,
        owner,
        1n,
        dummy.commitment,
        dummy.cover,
        troops,
        dummy.cargo,
        before.chainTime,
      );
      const localDuration = scaledSeconds(preview.duration, timeScale);
      const natural = before.chainTime + localDuration + 12n;
      const round = (natural + 15n - 1692803367n + 2n) / 3n + 1n;
      const arrival = 1692803367n + (round - 1n) * 3n - 15n;
      assert(arrival <= before.chainTime + localDuration + vendetta.config.hiddenArrivalSlack);
      const item = await preparePacket(name, round, 1n, origin);
      save(`${name}-packet.json`, item);
      const id = before.world.nextMission;
      await call(`${name}-send`, "sendHiddenMission", [
        1n,
        item.commitment,
        item.cover,
        troops,
        item.cargo,
        item.packet,
        arrival,
      ]);
      const admitted = await world(`${name}-admitted`);
      assert.equal(
        admitted.world.missions.get(id)!.duration,
        localDuration,
        "Scaled contract/model duration mismatch",
      );
      const entry = admitted.world.hiddenEvidence.get(id)!;
      const original = { arrival: entry.receipt.arrival, seq: entry.receipt.seq };
      const context = sim.hiddenContext.encode(
        admitted.world,
        id,
        Buffer.from(item.packet.slice(2), "hex"),
        { chainId: 31337n, game },
      );
      assert.equal(sim.hiddenContext.digest(context), entry.receipt.statement);
      const request = {
        chainId: 31337,
        game,
        mission: String(id),
        packet: item.packet,
        statement: entry.receipt.statement,
      };
      save(`${name}-request.json`, request);
      save(`${name}-context.json`, {
        abi: toHex(context),
        statement: entry.receipt.statement,
        round,
        ...original,
      });
      const pending = async (label: string) => {
        const p = await world(label);
        assert.deepEqual(p.world, admitted.world, "Infrastructure failure mutated the World");
        assert.equal(p.world.hiddenEvidence.get(id)!.receipt.status, sim.hiddenResolution.PENDING);
        assert.equal(p.world.hiddenEvidence.get(id)!.receipt.consumed, false);
        assert.equal(p.world.missions.get(id)!.arrival, original.arrival);
        assert.equal(p.world.missions.get(id)!.seq, original.seq);
      };
      await waitUntil(arrival + 15n);
      const requestProof = async (url = stack!.summary.prover) => {
        const response = await proofFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + stack!.token },
          body: JSON.stringify(request),
          signal: AbortSignal.any([stop.signal, AbortSignal.timeout(30 * 60 * 1000)]),
        });
        const body = await response.text();
        save(`${name}-http-${fault}.json`, { status: response.status, body });
        if (!response.ok) throw new Error(`Producer HTTP ${response.status}`);
        const certificate = JSON.parse(body).certificate as Hex;
        assert.match(certificate, /^0x[0-9a-f]+$/i);
        return certificate;
      };
      if (!testedFaults && !name.startsWith("u-")) {
        for (const mode of faultCases) {
          current = mode;
          fault = mode;
          const previousInjections = injectedFaults;
          const proofsBefore: number = stack.stats().proofs;
          // Failed native attempts remain in this session; never turn an error into a certificate.
          if (mode === "producer-unavailable") {
            const outage = createServer((_, response) =>
              response.writeHead(503).end("Producer unavailable"),
            );
            await new Promise<void>((resolve) => outage.listen(0, "127.0.0.1", resolve));
            try {
              const address = outage.address();
              assert(address && typeof address !== "string");
              await assert.rejects(requestProof(`http://127.0.0.1:${address.port}`), /HTTP 503/);
            } finally {
              await new Promise<void>((resolve, reject) =>
                outage.close((error) => (error ? reject(error) : resolve())),
              );
            }
          } else await assert.rejects(requestProof(), /HTTP 503/);
          await pending(`${mode}-pending`);
          assert.equal(stack.stats().proofs, proofsBefore);
          if (mode !== "producer-unavailable")
            assert.equal(injectedFaults, previousInjections + 1, "Fault injection was not reached");
        }
        testedFaults = true;
        fault = "healthy";
        current = name;
      }
      const certificate = await requestProof();
      const [kind, proof, encodedInputs] = decodeAbiParameters(
        [{ type: "uint8" }, { type: "bytes" }, { type: "bytes" }],
        certificate,
      );
      assert.equal(kind, name.startsWith("u-") ? 2 : 1);
      save(`${name}-certificate.json`, { certificate, kind, proof, encodedInputs });
      if (kind === 1) {
        const [inputs] = decodeAbiParameters([{ type: "uint256[55]" }], encodedInputs);
        assert.equal(inputs[50], item.valid ? 1n : 0n);
      }
      // A rejected proof is never an INVALID receipt. Submit the damaged proof to the EVM,
      // preserve the reverted receipt and prove the complete World is still pending.
      const damaged = Buffer.from(proof.slice(2), "hex");
      assert(damaged.length > 0);
      damaged[0] = damaged[0]! ^ 1;
      const rejectedCertificate = encodeAbiParameters(
        [{ type: "uint8" }, { type: "bytes" }, { type: "bytes" }],
        [kind, toHex(damaged), encodedInputs],
      );
      const rejected = await pub.waitForTransactionReceipt({
        hash: await wallet.writeContract({
          address: game,
          abi: gameAbi,
          functionName: "submitHiddenEvidence",
          args: [id, rejectedCertificate],
          gas: 12000000n,
        }),
      });
      save(`${name}-rejected-proof.json`, { certificate: rejectedCertificate, receipt: rejected });
      assert.equal(rejected.status, "reverted");
      await pending(`${name}-rejected-proof-pending`);
      const submitted = await call(`${name}-submit`, "submitHiddenEvidence", [id, certificate]);
      const recorded = submitted.logs.flatMap((log) => {
        try {
          const e = decodeEventLog({ abi: gameAbi, data: log.data, topics: log.topics });
          return e.eventName === "HiddenEvidenceRecorded" ? [e] : [];
        } catch {
          return [];
        }
      });
      assert.equal(recorded.length, 1);
      assert.equal((recorded[0]!.args as { valid: boolean }).valid, item.valid);
      save(`${name}-events.json`, recorded);
      const duplicate = await call(`${name}-duplicate`, "submitHiddenEvidence", [id, certificate]);
      assert(
        !duplicate.logs.some((log) => {
          try {
            return (
              decodeEventLog({ abi: gameAbi, data: log.data, topics: log.topics }).eventName ===
              "HiddenEvidenceRecorded"
            );
          } catch {
            return false;
          }
        }),
      );
      // Reference resolution happens at the original arrival, even when the new proof was late.
      const punctual = structuredClone(admitted.world);
      sim.hiddenResolution.recordVerified(
        punctual.hiddenEvidence.get(id)!.receipt,
        entry.receipt.statement,
        item.valid,
        item.valid ? encodePlainV2(item.plain) : new Uint8Array(),
      );
      sim.advance(punctual, 100, arrival);
      await call(`${name}-advance-arrival`, "advance", [100n]);
      const resolved = await world(`${name}-resolved`);
      const consumed = resolved.world.hiddenEvidence.get(id)!.receipt;
      assert.equal(consumed.consumed, true);
      assert.equal(consumed.arrival, original.arrival);
      assert.equal(consumed.seq, original.seq);
      sim.advance(punctual, 100, resolved.chainTime);
      assert.deepEqual(resolved.world, punctual, "Full World differs from punctual oracle");
      const returnAt = resolved.world.missions.get(id)?.arrival ?? resolved.chainTime;
      await waitUntil(returnAt);
      await call(`${name}-advance-return`, "advance", [100n]);
      const returned = await world(`${name}-returned`);
      sim.advance(punctual, 100, returned.chainTime);
      assert.deepEqual(returned.world, punctual);
      assert(!returned.world.missions.has(id));
      await call(`${name}-duplicate-after-return`, "submitHiddenEvidence", [id, certificate]);
      await call(`${name}-advance-again`, "advance", [100n]);
      const final = await world(`${name}-final`);
      sim.advance(punctual, 100, final.chainTime);
      assert.deepEqual(final.world, punctual, "Duplicate evidence credited twice");
      save(`${name}-punctual-world.json`, punctual);
      results.find((r) => r.name === name)!.status = "PASS";
      if (testedFaults)
        for (const mode of faultCases) results.find((r) => r.name === mode)!.status = "PASS";
      save("results.json", results);
    }
    // Browser observation is independent from harness submission, with an explicit provenance label.
    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(stack.summary.web + "/#/dev");
      await page.screenshot({ path: join(out, "browser-observation.png"), fullPage: true });
      save("browser.json", { mode: "observation", submittedMissions: false, url: page.url() });
    } finally {
      await browser.close();
    }
    save("producer-stats.json", stack.stats());
    // Export only public proof artifacts, never native inputs, file keys, journals or credentials.
    for (const file of readdirSync(join(out, "session/cache")).filter((f) =>
      f.endsWith(".proof.json"),
    )) {
      const a = JSON.parse(readFileSync(join(out, "session/cache", file), "utf8"));
      save("proof-" + file, {
        kind: a.kind,
        statement: a.statement,
        proof: a.proof,
        publicInputs: a.publicInputs,
        setupManifestSha256: a.setupManifestSha256,
      });
    }
  }
} catch (error) {
  if (current) {
    const r = results.find((r) => r.name === current)!;
    r.status = "FAIL";
    r.detail = String(error);
  }
  save("error.json", {
    error: String(error),
    cause:
      error instanceof Error && error.cause instanceof Error
        ? { name: error.cause.name, message: error.cause.message }
        : undefined,
    current,
    infrastructureFailureIsInvalid: false,
  });
  process.exitCode = 1;
} finally {
  try {
    await stack?.close();
  } catch (error) {
    save("cleanup-error.json", { error: String(error) });
    process.exitCode = 1;
  }
  save("results.json", results);
  save("harness-log.json", transcript);
  // All top-level artifacts are written by this harness from explicit public fields.
  const files = readdirSync(out).filter((f) => f.endsWith(".json") || f.endsWith(".png"));
  const hashes = Object.fromEntries(
    files.map((file) => [
      file,
      createHash("sha256")
        .update(readFileSync(join(out, file)))
        .digest("hex"),
    ]),
  );
  save("hashes.json", hashes);
  execFileSync(
    "python3",
    [
      "-c",
      "import sys,zipfile; z=zipfile.ZipFile('evidence.zip','x',compression=zipfile.ZIP_DEFLATED); [z.write(f,f) for f in sys.argv[1:]]; z.close()",
      ...files,
      "hashes.json",
    ],
    { cwd: out },
  );
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.removeListener(signal, abort);
}

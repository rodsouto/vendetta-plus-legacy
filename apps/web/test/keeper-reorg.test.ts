// Real keeper CLI and Game with explicit trusted mock certificates. Crypto/H3
// proving is exercised separately by the real producer benchmarks.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { encodeAbiParameters, keccak256, toHex, type Hex } from "viem";
import { expect, it, vi } from "vitest";
import { sim, vendetta } from "@vendetta/rules";
import { startChain } from "./anvil.js";
import { DEV_KEYS } from "../src/chain/config.js";
import { gameAbi } from "../src/chain/abi.js";
import { cloneWorld, controllerKey, loadWorld } from "../src/chain/load.js";
import { decodeHiddenEvidence } from "../src/chain/hidden-evidence.js";
import { encodePlain } from "../src/chain/codec.js";
import { producerFaults } from "../scripts/experiments/producer-faults.js";

it("recovers the actual keeper across lost receipts and a replaced hidden admission without reusing the orphaned packet", async () => {
  const local = await startChain(8629);
  const c = local.clients,
    game = c.deployment.game;
  const dir = await mkdtemp(join(tmpdir(), "vendetta-keeper-reorg-"));
  const proxy = await producerFaults(c.deployment.rpc, new Map());
  let keeper: ReturnType<typeof spawn> | undefined;
  let keeperExited: Promise<void> | undefined;
  let output = "";
  const packets = new Map<string, Hex>();
  const plains = new Map<
    string,
    { kind: number; target: { city: bigint; neighborhood: bigint; slot: bigint }; salt: bigint }
  >();
  const requested: Hex[] = [];
  const providerErrors: string[] = [];
  const provider = createServer(async (req, res) => {
    try {
      expect(req.headers.authorization).toBe("Bearer keeper-reorg-token-0000000000000000");
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const id = BigInt(body.mission);
      const m = await c.public.readContract({
        address: game,
        abi: gameAbi,
        functionName: "getMission",
        args: [id],
      });
      const e = decodeHiddenEvidence(
        await c.public.readContract({
          address: game,
          abi: gameAbi,
          functionName: "getHiddenEvidence",
          args: [id],
        }),
      )!;
      expect(body.packet).toBe(packets.get(m.commit));
      expect(body.statement).toBe(e.receipt.statement);
      requested.push(body.packet);
      const plain = plains.get(m.commit)!;
      expect(sim.hiddenCommit(m.owner, plain.kind, plain.target, plain.salt)).toBe(m.commit);
      const inputs = Array<bigint>(55).fill(0n);
      inputs[48] = BigInt(e.receipt.statement) >> 128n;
      inputs[49] = BigInt(e.receipt.statement) & ((1n << 128n) - 1n);
      const certificate = encodeAbiParameters(
        [{ type: "uint8" }, { type: "bytes" }, { type: "bytes" }],
        [
          1,
          encodeAbiParameters(
            [{ type: "bool" }, { type: "bytes" }],
            [true, toHex(encodePlain(plain))],
          ),
          encodeAbiParameters([{ type: "uint256[55]" }], [inputs as never]),
        ],
      );
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ certificate }));
    } catch (error) {
      providerErrors.push(String(error));
      res.writeHead(500).end();
    }
  });
  const call = async (account: number, functionName: string, args: unknown[]) => {
    const hash = await c.wallet(account).writeContract({
      address: game,
      abi: gameAbi,
      functionName,
      args,
      chain: null,
      gas: 12000000n,
    } as never);
    expect((await c.public.waitForTransactionReceipt({ hash, pollingInterval: 20 })).status).toBe(
      "success",
    );
  };
  const warp = async (seconds: number) => {
    await c.public.request({ method: "evm_increaseTime" as never, params: [seconds] as never });
    await c.public.request({ method: "evm_mine" as never });
  };
  try {
    await call(1, "register", [1n, 1n, 1n]);
    await call(2, "register", [1n, 1n, 2n]);
    await call(1, "queueRoom", [1n, 11n]);
    await warp(86400);
    await call(1, "train", [1n, 0n, 7n]);
    await warp(86400);
    await call(1, "poke", [1n]);
    const before = await loadWorld(c.public, game);
    const target = { city: 1n, neighborhood: 1n, slot: 2n };
    const troops = vendetta.troops.map((_, i) => (i === 0 ? 5n : 0n));
    const cargo = [0n, 0n, 0n, 0n];
    const firstPlain = { kind: sim.ATTACK, target, salt: 5n };
    const secondPlain = { ...firstPlain, salt: 6n };
    const firstCommit = sim.hiddenCommit(1n, sim.ATTACK, target, firstPlain.salt) as Hex;
    const secondCommit = sim.hiddenCommit(1n, sim.ATTACK, target, secondPlain.salt) as Hex;
    const natural =
      sim.previewHiddenMission(
        cloneWorld(before.world),
        controllerKey(c.wallet(1).account!.address),
        1n,
        firstCommit,
        1n,
        troops,
        cargo,
        before.chainTime,
      ).arrival + 20n;
    const arrival = natural + ((3n - ((natural + 15n - 1692803367n) % 3n)) % 3n);
    const firstPacket = Buffer.alloc(273);
    firstPacket.set(Buffer.from("56444832" + sim.hiddenContext.NETWORK, "hex"));
    firstPacket.writeBigUInt64BE((arrival + 15n - 1692803367n) / 3n + 1n, 36);
    const secondPacket = Buffer.from(firstPacket);
    secondPacket[272] = 1;
    packets.set(firstCommit, toHex(firstPacket));
    packets.set(secondCommit, toHex(secondPacket));
    plains.set(firstCommit, firstPlain);
    plains.set(secondCommit, secondPlain);
    const snapshot = await c.public.request({ method: "evm_snapshot" as never });
    await call(1, "sendHiddenMission", [
      1n,
      firstCommit,
      1,
      troops,
      cargo,
      toHex(firstPacket),
      arrival,
    ]);
    const late = arrival + 7200n;
    const jumpLate = async () => {
      await c.public.request({
        method: "evm_setNextBlockTimestamp" as never,
        params: [Number(late)] as never,
      });
      await c.public.request({ method: "evm_mine" as never });
    };
    await jumpLate();
    await new Promise<void>((done) => provider.listen(0, "127.0.0.1", done));
    const deployment = join(dir, "deployment.json");
    await writeFile(deployment, JSON.stringify({ ...c.deployment, rpc: proxy.rpc }));
    proxy.setMode("h3");
    keeper = spawn(process.execPath, ["--import", "tsx", "scripts/keeper.ts", deployment], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      env: {
        ...process.env,
        RPC_URL: proxy.rpc,
        KEEPER_PRIVATE_KEY: DEV_KEYS[6],
        KEEPER_STATE_DIR: join(dir, "state"),
        HIDDEN_PROVER_URL: `http://127.0.0.1:${(provider.address() as AddressInfo).port}`,
        HIDDEN_PROVER_TOKEN: "keeper-reorg-token-0000000000000000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    keeperExited = new Promise<void>((done) => keeper!.once("close", () => done()));
    for (const stream of [keeper.stdout, keeper.stderr])
      stream!.on("data", (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-65536);
      });
    const evidence = async () =>
      decodeHiddenEvidence(
        await c.public.readContract({
          address: game,
          abi: gameAbi,
          functionName: "getHiddenEvidence",
          args: [1n],
        }),
      )!;
    await vi.waitFor(
      async () => {
        expect((await evidence()).receipt.status).toBe(2);
        expect(proxy.stats().receiptsRejected).toBeGreaterThanOrEqual(3);
      },
      { timeout: 15000, interval: 100 },
    );
    const name = (await readdir(join(dir, "state"))).find(
      (name) => name.startsWith("keeper-") && name.endsWith(".json"),
    );
    expect(name).toBeDefined();
    const journal = join(dir, "state", name!);
    const raw = JSON.parse(await readFile(journal, "utf8")) as Hex;
    const originalHash = keccak256(raw);
    expect((await c.public.getTransactionReceipt({ hash: originalHash })).status).toBe("success");
    expect(
      await c.public.readContract({ address: game, abi: gameAbi, functionName: "pendingMissions" }),
    ).toEqual([1n]);
    expect(requested).toEqual([toHex(firstPacket)]);
    expect(
      await c.public.request({ method: "evm_revert" as never, params: [snapshot] as never }),
    ).toBe(true);
    await c.public.request({
      method: "evm_setNextBlockTimestamp" as never,
      params: [Number(before.chainTime + 1n)] as never,
    });
    await call(1, "sendHiddenMission", [
      1n,
      secondCommit,
      1,
      troops,
      cargo,
      toHex(secondPacket),
      arrival,
    ]);
    const pending = await loadWorld(c.public, game);
    const expected = cloneWorld(pending.world);
    const receipt = expected.hiddenEvidence.get(1n)!.receipt;
    sim.hiddenResolution.recordVerified(receipt, receipt.statement, true, encodePlain(secondPlain));
    sim.advance(expected, 20, late);
    await jumpLate();
    expect(await readFile(journal, "utf8")).toBe(JSON.stringify(raw));
    proxy.setMode("healthy");
    await vi.waitFor(
      async () => {
        expect(
          await c.public.readContract({
            address: game,
            abi: gameAbi,
            functionName: "pendingMissions",
          }),
        ).toEqual([]);
        await expect(readFile(journal)).rejects.toMatchObject({ code: "ENOENT" });
      },
      { timeout: 20000, interval: 100 },
    );
    expect((await c.public.getTransactionReceipt({ hash: originalHash })).status).toBe("reverted");
    expect(requested).toEqual([toHex(firstPacket), toHex(secondPacket)]);
    expect(providerErrors).toEqual([]);
    expect(output).toContain("Keeper transaction reverted");
    expect((await evidence()).receipt.status).toBe(2);
    expect((await evidence()).receipt.consumed).toBe(true);
    expect((await loadWorld(c.public, game)).world).toEqual(expected);
  } catch (error) {
    throw new Error(`${String(error)}\n${output}`);
  } finally {
    keeper?.kill();
    if (keeperExited) await keeperExited;
    provider.closeAllConnections();
    await new Promise<void>((done) => provider.close(() => done()));
    await proxy.close();
    local.stop();
    await rm(dir, { recursive: true, force: true });
  }
}, 90000);

// The loader + projection must agree with the contract: project the loaded world to a time T, then
// make the chain settle every building at exactly T and compare.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeAbiParameters, toHex, type Address, type Hex } from "viem";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sim, vendetta as rs } from "@vendetta/rules";
import { gameAbi } from "../src/chain/abi.js";
import { cloneWorld, controllerKey, loadWorld, project } from "../src/chain/load.js";
import { CiphertextIndex, timelockFor } from "../src/chain/hidden.js";
import type { Network } from "../src/chain/networks.js";
import { startChain } from "./anvil.js";
import type { Clients } from "../src/chain/config.js";

let hasAnvil = true;
try {
  execFileSync("anvil", ["--version"], { stdio: "ignore" });
} catch {
  hasAnvil = false;
}

it.skipIf(!hasAnvil)("keeps timers live and reports a failed fixture deployment", async () => {
  const bin = mkdtempSync(join(tmpdir(), "vendetta-test-cli-"));
  const path = process.env.PATH;
  let ticked = false;
  const timer = setTimeout(() => (ticked = true), 50);
  try {
    writeFileSync(join(bin, "cast"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    writeFileSync(
      join(bin, "forge"),
      '#!/bin/sh\nsleep 0.2\necho "synthetic deployment failure" >&2\nexit 1\n',
      { mode: 0o700 },
    );
    process.env.PATH = `${bin}:${path}`;
    await expect(startChain(8618)).rejects.toThrow("synthetic deployment failure");
    expect(ticked).toBe(true);
  } finally {
    clearTimeout(timer);
    process.env.PATH = path;
    rmSync(bin, { recursive: true, force: true });
  }
});

describe.skipIf(!hasAnvil)("chain loader", () => {
  let clients: Clients;
  let stop = () => {};
  beforeAll(async () => {
    ({ clients, stop } = await startChain(8611));
  }, 60_000);
  afterAll(() => stop());

  const send = async (account: number, functionName: string, args: unknown[]) => {
    const hash = await clients.wallet(account).writeContract({
      address: clients.deployment.game,
      abi: gameAbi,
      functionName,
      args,
      chain: null,
    } as never);
    await clients.public.waitForTransactionReceipt({ hash });
  };
  const warp = async (seconds: number) => {
    await clients.public.request({
      method: "evm_increaseTime" as never,
      params: [seconds] as never,
    });
    await clients.public.request({ method: "evm_mine" as never });
  };

  it("loads activated v2 receipts, stops projection at evidence waits and replays late resolution", async () => {
    const local = await startChain(8617),
      c = local.clients,
      game = c.deployment.game;
    try {
      const sendV2 = async (account: number, functionName: string, args: unknown[]) => {
        const hash = await c.wallet(account).writeContract({
          address: game,
          abi: gameAbi,
          functionName,
          args,
          chain: null,
          // Historical draining requires the 7M per-mission reserve plus processing gas.
          gas: 12_000_000n,
        } as never);
        const receipt = await c.public.waitForTransactionReceipt({ hash });
        expect(receipt.status, functionName).toBe("success");
      };
      const warpV2 = async (seconds: number) => {
        await c.public.request({ method: "evm_increaseTime" as never, params: [seconds] as never });
        await c.public.request({ method: "evm_mine" as never });
      };
      const [consumer] = await c.public.readContract({
        address: game,
        abi: gameAbi,
        functionName: "hiddenConsumers",
      });
      await sendV2(1, "register", [1n, 1n, 1n]);
      await sendV2(2, "register", [1n, 1n, 2n]);
      await sendV2(1, "queueRoom", [1n, 11n]);
      await warpV2(86400);
      await sendV2(1, "train", [1n, 0n, 7n]);
      await warpV2(86400);
      await sendV2(1, "poke", [1n]);
      const before = await loadWorld(c.public, game);
      expect(before.world.hiddenConsumers.openingConsumer).toBe(consumer.toLowerCase());
      const alice = controllerKey(c.wallet(1).account!.address),
        target = { city: 1n, neighborhood: 1n, slot: 2n };
      const commit = sim.hiddenCommit(1n, sim.ATTACK, target, 5n),
        troops = rs.troops.map((_, i) => (i === 0 ? 5n : 0n)),
        cargo = [0n, 0n, 0n, 0n];
      // Compute the natural duration in an identical legacy economic world, then admit with margin.
      const trial = cloneWorld(before.world);
      const natural =
        sim.previewHiddenMission(trial, alice, 1n, commit, 1n, troops, cargo, before.chainTime)
          .arrival + 20n;
      const id = before.world.nextMission;
      const arrival = natural + ((3n - ((natural + 15n - 1692803367n) % 3n)) % 3n);
      const packet = Buffer.alloc(273);
      packet.set(Buffer.from("56444832" + sim.hiddenContext.NETWORK, "hex"));
      packet.writeBigUInt64BE((arrival + 15n - 1692803367n) / 3n + 1n, 36);
      await sendV2(1, "sendHiddenMission", [1n, commit, 1, troops, cargo, toHex(packet), arrival]);
      const pending = await loadWorld(c.public, game),
        e = pending.world.hiddenEvidence.get(id)!;
      expect(e.receipt.statement).toBe(
        sim.hiddenContext.statement(pending.world, id, packet, { chainId: 31337n, game }),
      );
      expect(e.receipt.status).toBe(sim.hiddenResolution.PENDING);
      const late = arrival + 7200n;
      // Knowing the commitment plaintext cannot bypass certificate admission or advance buildings.
      const projected = project(
        pending.world,
        late,
        new Map([[commit, { kind: sim.ATTACK, target, salt: 5n }]]),
      );
      expect(projected.buildings).toEqual(pending.world.buildings);
      expect(projected.pending).toEqual([id]);
      await c.public.request({
        method: "evm_setNextBlockTimestamp" as never,
        params: [Number(late)] as never,
      });
      const inputs = Array<bigint>(55).fill(0n),
        root = BigInt(e.receipt.statement);
      inputs[48] = root >> 128n;
      inputs[49] = root & ((1n << 128n) - 1n);
      const certificate = encodeAbiParameters(
        [{ type: "uint8" }, { type: "bytes" }, { type: "bytes" }],
        [
          1,
          encodeAbiParameters(
            [{ type: "bool" }, { type: "bytes" }],
            [true, toHex(Buffer.from("0201010102" + "00".repeat(31) + "05", "hex"))],
          ),
          encodeAbiParameters([{ type: "uint256[55]" }], [inputs]),
        ],
      );
      // Mock verifies routing only; the all-zero U above is not a real valid cryptographic packet.
      await sendV2(0, "submitHiddenEvidence", [id, certificate]);
      const certified = await loadWorld(c.public, game);
      expect(certified.world.hiddenEvidence.get(id)!.receipt.status).toBe(
        sim.hiddenResolution.VALID,
      );
      const expected = cloneWorld(certified.world);
      sim.advance(expected, 20, late + 10n);
      await sendV2(0, "advance", [20n]);
      const resolved = await loadWorld(c.public, game);
      expect(resolved.world).toEqual(expected);
      expect(resolved.world.hiddenEvidence.get(id)!.receipt.consumed).toBe(true);
    } finally {
      local.stop();
    }
  }, 60_000);

  it("projects exactly what the contract settles", async () => {
    const room = (id: string) => rs.buildings.findIndex((b) => b.id === id);
    await send(0, "setGlobalPremium", [10n ** 10n]);
    await send(1, "register", [1n, 1n, 1n]);
    await send(2, "register", [1n, 1n, 2n]);
    await send(1, "queueRoom", [1n, BigInt(room("boot_camp"))]);
    await send(1, "queueRoom", [1n, BigInt(room("weapons_armoury"))]);
    await warp(86400);
    await send(1, "train", [1n, 0n, 5n]);
    await warp(86400);
    const troops = rs.troops.map((_, i) => (i === 0 ? 5n : 0n));
    await send(1, "sendMission", [1n, sim.ATTACK, [1n, 1n, 2n], troops, [0n, 0n, 0n, 0n], 0n]);
    await send(2, "createFamily", ["MOB", "The Mob"]);

    const snap = await loadWorld(clients.public, clients.deployment.game);
    const at = snap.chainTime + 3n * 86400n; // the attack has arrived and come back by then
    const projected = project(snap.world, at);

    // Make the chain do the same at exactly `at`.
    await clients.public.request({
      method: "evm_setNextBlockTimestamp" as never,
      params: [Number(at)] as never,
    });
    await send(3, "advance", [100n]);
    for (const id of [1n, 2n]) {
      await clients.public.request({
        method: "evm_setNextBlockTimestamp" as never,
        params: [Number(at)] as never,
      });
      await send(3, "poke", [id]);
    }
    const chain = (await loadWorld(clients.public, clients.deployment.game)).world;

    for (const id of [1n, 2n]) {
      const a = projected.buildings.get(id)!;
      const b = chain.buildings.get(id)!;
      expect({ levels: a.levels, stock: a.stock, troops: a.troops, last: a.lastUpdate }).toEqual({
        levels: b.levels,
        stock: b.stock,
        troops: b.troops,
        last: b.lastUpdate,
      });
    }
    expect([...projected.missions.keys()]).toEqual([...chain.missions.keys()]);
    expect(projected.players.get(1n)!.centipoints).toBe(chain.players.get(1n)!.centipoints);
    expect(chain.families.get(1n)!.tag).toBe("MOB");
  }, 60_000);

  // Runs after the test above: player 1 has its 5 rowdies back home.
  it("loads an accepted trade as the simulator accepts it", async () => {
    const buyer = controllerKey(clients.wallet(1).account!.address);
    await send(2, "offerTrade", [1n, 2n, 0n, 300n, [0n, 0n, 0n, 100n]]);
    const before = await loadWorld(clients.public, clients.deployment.game);
    const id = before.world.nextTrade - 1n;
    expect(before.world.trades.get(id)).toMatchObject({ from: 2n, rate: [3n, 5n, 0n, 1n] });

    // The simulator accepts at the same second the chain will.
    const at = before.chainTime + 60n;
    const expected = cloneWorld(project(before.world, at));
    sim.acceptTrade(expected, buyer, id, 1n, at);
    await clients.public.request({
      method: "evm_setNextBlockTimestamp" as never,
      params: [Number(at)] as never,
    });
    await send(1, "acceptTrade", [id, 1n]);
    const chain = (await loadWorld(clients.public, clients.deployment.game)).world;
    expect(chain.trades.get(id)).toEqual(expected.trades.get(id));
    expect(chain.trades.get(id)).toMatchObject({ deposit: [0n, 0n, 0n, 10n], accepted: true });
    expect(chain.players.get(1n)!.purchases).toEqual([id]);
    expect(chain.players.get(2n)!.offers).toEqual(expected.players.get(2n)!.offers);
    for (const b of [1n, 2n])
      expect(chain.buildings.get(b)!.stock).toEqual(expected.buildings.get(b)!.stock);
  }, 60_000);
});

// The loader + projection must agree with the contract: project the loaded world to a time T, then
// make the chain settle every building at exactly T and compare.
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sim, vendetta as rs } from "@vendetta/rules";
import { gameAbi } from "../src/chain/abi.js";
import { loadWorld, project } from "../src/chain/load.js";
import { ciphertextOf, timelockFor } from "../src/chain/hidden.js";
import type { Network } from "../src/chain/networks.js";
import { startChain } from "./anvil.js";
import type { Clients } from "../src/chain/config.js";

let hasAnvil = true;
try {
  execFileSync("anvil", ["--version"], { stdio: "ignore" });
} catch {
  hasAnvil = false;
}

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
  it("loads hidden missions, reads their ciphertext and projects their reveal (B-22)", async () => {
    const timelock = timelockFor({ id: "local" } as Network);
    const target = { city: 1n, neighborhood: 1n, slot: 2n };
    const plain = { kind: sim.ATTACK, target, salt: 12345n };
    const commit = sim.hiddenCommit(1n, sim.ATTACK, target, plain.salt);
    const troops = rs.troops.map((_, i) => (i === 0 ? 5n : 0n));
    const ciphertext = await timelock.encrypt(plain, 0n);
    await send(1, "sendHiddenMission", [
      1n,
      commit,
      4,
      troops,
      [0n, 0n, 0n, 0n],
      ciphertext,
      2n ** 40n - 1n,
    ]);

    const snap = await loadWorld(clients.public, clients.deployment.game);
    const [m] = [...snap.world.missions.values()];
    expect(m).toMatchObject({ hidden: true, kind: 0, cover: 4n, commit });
    const c = await ciphertextOf(clients.public, clients.deployment.game, 0, m!.id);
    expect(await timelock.decrypt(c!)).toEqual(plain);

    const at = m!.arrival + 1n;
    const unknown = project(snap.world, at);
    expect(unknown.missions.get(m!.id)!.returning).toBe(false); // parked, waiting for its reveal
    expect(unknown.parked).toEqual([m!.id]);
    const known = new Map([[commit, plain]]);
    const projected = project(snap.world, at, known);
    expect(projected.missions.get(m!.id)!.returning).toBe(true);

    // Revealed at `at`, after its arrival: it resolves at the reveal, as the projection did.
    const salt = `0x${plain.salt.toString(16).padStart(64, "0")}`;
    await clients.public.request({
      method: "evm_setNextBlockTimestamp" as never,
      params: [Number(at)] as never,
    });
    await send(3, "reveal", [m!.id, sim.ATTACK, [1n, 1n, 2n], salt]);
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
      expect({ stock: a.stock, troops: a.troops }).toEqual({ stock: b.stock, troops: b.troops });
    }
    expect(chain.missions.get(m!.id)).toMatchObject({ hidden: false, returning: true });
  }, 60_000);
});

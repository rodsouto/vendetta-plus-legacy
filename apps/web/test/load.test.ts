// The loader + projection must agree with the contract: project the loaded world to a time T, then
// make the chain settle every building at exactly T and compare.
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sim, vendetta as rs } from "@vendetta/rules";
import { gameAbi } from "../src/chain/abi.js";
import { loadWorld, project } from "../src/chain/load.js";
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
});

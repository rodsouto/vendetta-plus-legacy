// Local-only automation: follow the UI's economic guide and train one occupation troop.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createTestClient, createWalletClient, http, isAddress, type Address } from "viem";
import { sim } from "@vendetta/rules";
import { gameAbi } from "../src/chain/abi.js";
import { anvilChain, devAccount, makeClients } from "../src/chain/config.js";
import { loadWorld } from "../src/chain/load.js";
import type { Deployment } from "../src/chain/networks.js";
import { expansionGuide, roomRecommendation } from "../src/state/guide.js";

const { values } = parseArgs({
  options: {
    deployment: { type: "string", default: "public/deployment.local.json" },
    account: { type: "string" },
    building: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(
    "pnpm prepare:occupation --account <local index 0..6|controller address> --building <id> [--deployment <file>]",
  );
  process.exit(0);
}
if (!values.account || !values.building || !/^[1-9]\d*$/.test(values.building))
  throw new Error("Provide --account <index|address> and --building <positive id>; see --help");
const controller: Address = isAddress(values.account)
  ? values.account
  : (() => {
      if (!/^[0-6]$/.test(values.account!)) throw new Error("Local account index must be 0..6");
      return devAccount(Number(values.account)).address;
    })();
const deployment = JSON.parse(readFileSync(values.deployment!, "utf8")) as Deployment;
if (deployment.chainId !== 31337) throw new Error("Only local chain 31337 is supported");
const clients = makeClients(deployment);
if ((await clients.public.getChainId()) !== 31337) throw new Error("RPC is not on chain 31337");
const test = createTestClient({
  chain: anvilChain(deployment),
  mode: "anvil",
  transport: http(deployment.rpc),
});
const wallet = createWalletClient({
  chain: clients.chain,
  transport: http(deployment.rpc),
  account: controller,
});
const building = BigInt(values.building);
const initial = await loadWorld(clients.public, deployment.game);
const original = initial.world.buildings.get(building);
if (!original) throw new Error(`Building ${building} does not exist`);
const player = initial.world.players.get(original.owner)!;
if (!player.controllers.some((a) => a.toLowerCase() === controller.toLowerCase()))
  throw new Error("The controller does not own this building");

async function call(functionName: string, args: unknown[]) {
  const gas = await clients.public.estimateContractGas({
    address: deployment.game,
    abi: gameAbi,
    functionName,
    args,
    account: controller,
  } as never);
  const hash = await wallet.writeContract({
    address: deployment.game,
    abi: gameAbi,
    functionName,
    args,
    gas: (gas * 3n) / 2n + 50000n,
  } as never);
  const receipt = await clients.public.waitForTransactionReceipt({ hash, pollingInterval: 50 });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
}
async function warp(seconds: bigint) {
  console.log(`  Advance time: ${seconds}s (affects the whole local chain)`);
  await test.increaseTime({ seconds: Number(seconds) });
  await test.mine({ blocks: 1 });
  await call("advance", [100n]);
  await call("poke", [building]);
}

console.log(`Prepare building ${building}, player ${player.id}, controller ${controller}`);
console.log(
  "Follow the expansion guide, produce resources normally, and train one occupation troop.",
);
await test.impersonateAccount({ address: controller });
let completed = false;
try {
  // Bounds catch impossible progression instead of jumping indefinitely.
  for (let iteration = 0; iteration < 2000; iteration++) {
    const { world: w, chainTime: now } = await loadWorld(clients.public, deployment.game);
    const b = w.buildings.get(building)!;
    const p = w.players.get(b.owner)!;
    if (b.owner !== original.owner) throw new Error("Building ownership changed");
    sim.settle(w, b, now);
    const rs = w.rs;
    const steps = expansionGuide(w, p, b);
    const next = steps.find((s) => s.kind !== "occupy" && !s.done);
    if (!next) {
      console.log(
        `Ready: building ${building} has ${b.troops[rs.roles.occupationTroop]} occupation troop(s).`,
      );
      completed = true;
      break;
    }
    const finishes = [...b.roomQueue, ...p.researchQueue, ...b.training.flat()]
      .map((j) => j.finishAt)
      .filter((t) => t > now);
    if (finishes.length) {
      await warp(finishes.reduce((a, c) => (a < c ? a : c)) - now + 1n);
      continue;
    }
    let kind = next.kind;
    let index = next.index;
    if (kind === "room") {
      const prerequisite = roomRecommendation(w, p, b, index);
      kind = prerequisite.kind;
      index = prerequisite.index;
    }
    const cost =
      kind === "room"
        ? sim.roomJob(w, b, index).cost
        : kind === "research"
          ? sim.researchJob(w, p, b, index).cost
          : rs.troops[index]!.cost;
    const scale = sim.stockScale(rs);
    const capacity = sim.capacities(w, b);
    const overflow = rs.resources.findIndex((r, i) => cost[r]! * scale > capacity[i]!);
    if (overflow >= 0) {
      const storage = rs.buildings.find((r) => r.storage?.resource === rs.resources[overflow]);
      if (!storage) throw new Error("No storage upgrade can cover this cost");
      const prerequisite = roomRecommendation(w, p, b, storage.index);
      kind = prerequisite.kind;
      index = prerequisite.index;
    } else if (!sim.affordable(w, b, cost)) {
      // Forecast production with the same exact integration used by the game (alcohol included).
      let seconds = 60n;
      for (; seconds <= 31536000n; seconds *= 2n) {
        const projected = structuredClone(b);
        sim.integrate(w, projected, now + seconds);
        if (sim.affordable(w, projected, cost)) break;
      }
      if (seconds > 31536000n)
        throw new Error("Resources cannot be produced within one game year; check economy");
      await warp(seconds);
      continue;
    }
    // A storage prerequisite might itself need resources; re-evaluate it on the next pass by
    // waiting in small production steps rather than submitting an unaffordable transaction.
    const actualCost =
      kind === "room"
        ? sim.roomJob(w, b, index).cost
        : kind === "research"
          ? sim.researchJob(w, p, b, index).cost
          : rs.troops[index]!.cost;
    if (!sim.affordable(w, b, actualCost)) {
      await warp(3600n);
      continue;
    }
    const definition =
      kind === "room"
        ? rs.buildings[index]!
        : kind === "research"
          ? rs.research[index]!
          : rs.troops[index]!;
    console.log(`${kind}: ${definition.id}`);
    await call(
      kind === "room" ? "queueRoom" : kind === "research" ? "queueResearch" : "train",
      kind === "troop" ? [building, BigInt(index), 1n] : [building, BigInt(index)],
    );
  }
  if (!completed) throw new Error("Progression iteration limit reached");
} finally {
  await test.stopImpersonatingAccount({ address: controller });
}

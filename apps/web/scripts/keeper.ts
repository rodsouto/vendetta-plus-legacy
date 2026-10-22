// Keeper (B-22, B-08, B-19): reveals hidden missions in arrival order as soon as their timelock
// opens, forfeits the
// ones nobody revealed once their grace is over, processes due missions, and settles the
// buildings whose points lag behind their finished queues, so the global queue and the ranking
// (B-18) do not wait for a player to act. It holds no secret: anyone may run one, and clients
// reveal on their own when it is down.
//
// Usage: tsx scripts/keeper.ts <deployment.json> [local|arbitrum]
//   KEEPER_PRIVATE_KEY         the account that pays the gas (default: anvil's account 9, local only)
//   RPC_URL                    overrides the deployment's rpc
//   KEEPER_SETTLE_INTERVAL_MS  how often stale points are settled (default 10 min; 5 s on local)
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum } from "viem/chains";
import { sim, vendetta as rs } from "@vendetta/rules";
import { gameAbi } from "../src/chain/abi.js";
import { anvilChain } from "../src/chain/config.js";
import { CiphertextIndex, timelockFor } from "../src/chain/hidden.js";
import { cloneWorld, loadWorld } from "../src/chain/load.js";
import type { Deployment, Network, NetworkId } from "../src/chain/networks.js";

const ANVIL_KEY_9 = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";
const TICK_MS = 2000;
/** Pokes per settle run: bounds the gas spent at once; the rest waits for the next run. */
const MAX_POKES_PER_RUN = 25;
/** Ciphertexts opened at once: drand and the RPC are shared with every client. */
const DECRYPT_CONCURRENCY = 4;

const [file, id = "local"] = process.argv.slice(2);
if (!file) throw new Error("usage: keeper.ts <deployment.json> [local|arbitrum]");
const base = JSON.parse(readFileSync(file, "utf8")) as Deployment;
const deployment: Deployment = { ...base, rpc: process.env.RPC_URL || base.rpc };
const chain = id === "arbitrum" ? arbitrum : anvilChain(deployment);
const key = (process.env.KEEPER_PRIVATE_KEY || (id === "local" ? ANVIL_KEY_9 : "")) as Hex;
if (!key) throw new Error("KEEPER_PRIVATE_KEY is required off local chains");
const SETTLE_INTERVAL_MS = Number(
  process.env.KEEPER_SETTLE_INTERVAL_MS || (id === "local" ? 5_000 : 600_000),
);

// Batched: loading the world is one call per entity.
const transport = http(deployment.rpc, { batch: { batchSize: 100 } });
const client = createPublicClient({ chain, transport }) as PublicClient;
const account = privateKeyToAccount(key);
const wallet = createWalletClient({ chain, transport, account });
const timelock = timelockFor({ id: id as NetworkId } as Network);
const game = deployment.game;
const ciphertexts = new CiphertextIndex(client, game, deployment.fromBlock);

type M = {
  owner: bigint;
  hidden: boolean;
  returning: boolean;
  arrival: number;
  seq: bigint;
  commit: Hex;
};

const read = <T>(functionName: string, args: unknown[] = []) =>
  client.readContract({ address: game, abi: gameAbi, functionName, args } as never) as Promise<T>;

/** The game's custom error a failed call reverted with, if it is one. */
const gameError = (e: unknown): string | undefined => {
  const message = e instanceof Error ? e.message : String(e);
  const m = /(?:reverted with the following reason|Error:)\s*([A-Za-z]+)\(\)/.exec(message);
  return m?.[1];
};

async function call(functionName: string, args: unknown[]): Promise<void> {
  const hash = await wallet.writeContract({
    address: game,
    abi: gameAbi,
    functionName,
    args,
    chain,
  } as never);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
}

/**
 * Missions whose ciphertext opened to something the contract rejects (a wrong plaintext): garbage
 * for good, never retried; they are forfeited once their grace is over. A transient error never
 * puts a mission here: the next tick tries again.
 */
const garbage = new Set<bigint>();

/** Runs `fn` over `items`, at most `limit` at a time, keeping the order of the results. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i]!);
    }),
  );
  return out;
}

type Verdict = { kind: "reveal"; args: unknown[] } | { kind: "garbage" } | { kind: "wait" };

/** What to do with a due hidden mission: reveal it, give it up as garbage, or wait. */
async function judge(mid: bigint, m: M): Promise<Verdict> {
  if (garbage.has(mid)) return { kind: "garbage" };
  const c = await ciphertexts.get(mid);
  if (!c) return { kind: "garbage" }; // no log carries a ciphertext for it
  const opened = await timelock.open(c); // throws on a transient failure: judged again next tick
  if ("locked" in opened) return { kind: "wait" };
  if ("garbage" in opened) return { kind: "garbage" };
  const { kind, target, salt } = opened.plain;
  if (sim.hiddenCommit(m.owner, kind, target, salt) !== m.commit.toLowerCase()) {
    return { kind: "garbage" }; // a plaintext that is not the one committed to
  }
  const { city, neighborhood, slot } = target;
  return {
    kind: "reveal",
    args: [mid, kind, [city, neighborhood, slot], `0x${salt.toString(16).padStart(64, "0")}`],
  };
}

async function tick(): Promise<void> {
  await ciphertexts.catchUp();
  const now = (await client.getBlock()).timestamp;
  const [queued, parked] = await Promise.all([
    read<readonly bigint[]>("pendingMissions"),
    read<readonly bigint[]>("parkedMissions"),
  ]);
  const missions = await Promise.all(
    [...queued, ...parked].map(async (id) => [id, await read<M>("getMission", [id])] as const),
  );
  // Due hidden missions nobody revealed (parked, or still queued), oldest first.
  const due = missions
    .filter(([, m]) => m.hidden && !m.returning && BigInt(m.arrival) <= now)
    .sort(([, a], [, b]) => a.arrival - b.arrival || (a.seq < b.seq ? -1 : 1));
  const grace = rs.config.hiddenRevealGrace;
  const live = due.filter(([, m]) => now < BigInt(m.arrival) + grace);
  const verdicts = await mapLimit(live, DECRYPT_CONCURRENCY, async ([mid, m]) => {
    try {
      return await judge(mid, m);
    } catch (e) {
      console.warn(`mission ${mid}: cannot open yet:`, (e as Error).message.split("\n")[0]);
      return { kind: "wait" } as Verdict;
    }
  });
  // Reveals go in arrival order (B-22): a mission that stays parked (its round not out, garbage,
  // a failed reveal) holds the ones behind it until its order window ends; those would revert
  // OutOfOrder, so they wait for the next tick instead.
  const window = rs.config.hiddenOrderWindow;
  let holdUntil = 0n;
  for (const [i, [mid, m]] of live.entries()) {
    const v = verdicts[i]!;
    const windowEnd = BigInt(m.arrival) + window;
    const hold = () => {
      if (windowEnd > holdUntil) holdUntil = windowEnd;
    };
    if (v.kind === "garbage") {
      if (!garbage.has(mid)) console.warn(`mission ${mid} is garbage: forfeited after its grace`);
      garbage.add(mid);
      hold();
      continue;
    }
    if (v.kind !== "reveal" || now < holdUntil) {
      hold();
      continue;
    }
    try {
      await call("reveal", v.args);
      console.log(`revealed mission ${mid}`);
    } catch (e) {
      const name = gameError(e);
      if (name && name !== "Backlog" && name !== "OutOfOrder") {
        // The contract rejects the plaintext (BadReveal, InvalidCover, InvalidMission): garbage.
        garbage.add(mid);
        console.warn(`mission ${mid} does not reveal: ${name}`);
      } else {
        console.warn(`mission ${mid}: ${(e as Error).message.split("\n")[0]}`); // next tick
      }
      hold();
    }
  }
  // Past the grace, nobody revealed: send them home (B-22). The sender may have done it already.
  for (const [mid, m] of due) {
    if (now < BigInt(m.arrival) + grace) continue;
    try {
      await call("forfeit", [mid]);
      console.log(`forfeited mission ${mid}`);
    } catch (e) {
      console.warn(`forfeit ${mid} failed:`, (e as Error).message.split("\n")[0]);
    }
  }
  // Process what is due (a mission revealed in this tick re-entered the queue at the reveal).
  const head = missions
    .filter(([id]) => queued.includes(id))
    .map(([, m]) => m)
    .sort((a, b) => a.arrival - b.arrival || (a.seq < b.seq ? -1 : 1))[0];
  if (head && BigInt(head.arrival) <= now) await advance();
}

/**
 * Processes due missions in batches; a batch that does not fit the gas (B-08: a heavy mission, a
 * long backlog) falls back to one mission per transaction until the queue is caught up.
 */
async function advance(): Promise<void> {
  try {
    await call("advance", [BigInt(sim.MAX_MISSIONS_PER_TX)]);
    console.log("advanced the mission queue");
    return;
  } catch (e) {
    console.warn("advance in a batch failed, one at a time:", (e as Error).message.split("\n")[0]);
  }
  for (let i = 0; i < sim.MAX_MISSIONS_PER_TX; i++) {
    try {
      await call("advance", [1n]);
      console.log("advanced one mission");
    } catch (e) {
      console.warn("advance failed:", (e as Error).message.split("\n")[0]);
      return;
    }
  }
}

/**
 * Settles the buildings whose points would change (B-06, B-19): lazy settlement leaves a player
 * whose queues finished at the points of its last settlement until a transaction touches the
 * building, and the ranking (B-18) ranks on the stored value. The simulator tells which buildings
 * those are; `poke` is permissionless, and the state is the same either way.
 */
async function settleStale(): Promise<void> {
  const { world, chainTime } = await loadWorld(client, game);
  const c = cloneWorld(world);
  try {
    sim.drain(c, chainTime); // poke drains the queue first: a backlog waits for the mission job
  } catch (e) {
    if (!(e instanceof sim.GameError)) throw e;
    console.log(`settle: waiting on the mission queue (${e.code})`);
    return;
  }
  const stale: bigint[] = [];
  for (const b of c.buildings.values()) {
    if (b.owner === 0n || b.lastUpdate >= chainTime) continue;
    const p = c.players.get(b.owner)!;
    const before = p.centipoints;
    sim.settle(c, b, chainTime);
    if (p.centipoints !== before) stale.push(b.id);
  }
  let sent = 0;
  for (const id of stale.slice(0, MAX_POKES_PER_RUN)) {
    try {
      await call("poke", [id]);
      sent++;
    } catch (e) {
      // Backlog: the mission job catches up and the next run retries.
      console.warn(`poke ${id} failed:`, (e as Error).message.split("\n")[0]);
      break;
    }
  }
  if (stale.length > 0) console.log(`settled ${sent} of ${stale.length} stale buildings`);
}

console.log(
  `keeper ${account.address} for ${game} on ${chain.name} (${deployment.rpc}), timelock ${id === "arbitrum" ? "drand" : "plain"}, ` +
    `settling stale points every ${SETTLE_INTERVAL_MS / 1000} s`,
);
let lastSettle = 0;
for (;;) {
  try {
    await tick();
  } catch (e) {
    console.error("tick failed:", (e as Error).message.split("\n")[0]);
  }
  if (Date.now() - lastSettle >= SETTLE_INTERVAL_MS) {
    lastSettle = Date.now();
    try {
      await settleStale();
    } catch (e) {
      console.error("settle failed:", (e as Error).message.split("\n")[0]);
    }
  }
  await new Promise((r) => setTimeout(r, TICK_MS));
}

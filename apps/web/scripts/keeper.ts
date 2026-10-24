// Keeper (B-22, B-08): reveals hidden missions in arrival order as soon as their timelock opens,
// forfeits the ones nobody revealed once their grace is over, and processes due missions, so the
// global queue does not wait for a player to act. It holds no secret: anyone may run one, and
// clients reveal on their own when it is down.
//
// Usage: tsx scripts/keeper.ts <deployment.json> [local|gnosis]
//   KEEPER_PRIVATE_KEY  the account that pays the gas (default: anvil's account 9, local only)
//   RPC_URL             overrides the deployment's rpc
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { gnosis } from "viem/chains";
import { sim, vendetta as rs } from "@vendetta/rules";
import { gameAbi } from "../src/chain/abi.js";
import { anvilChain } from "../src/chain/config.js";
import { CiphertextIndex, timelockFor } from "../src/chain/hidden.js";
import type { Deployment, Network, NetworkId } from "../src/chain/networks.js";

const ANVIL_KEY_9 = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";
const TICK_MS = 2000;
/** Ciphertexts opened at once: drand and the RPC are shared with every client. */
const DECRYPT_CONCURRENCY = 4;

const [file, id = "local"] = process.argv.slice(2);
if (!file) throw new Error("usage: keeper.ts <deployment.json> [local|gnosis]");
if (id !== "local" && id !== "gnosis") throw new Error(`Unsupported network: ${id}`);
const base = JSON.parse(readFileSync(file, "utf8")) as Deployment;
const deployment: Deployment = { ...base, rpc: process.env.RPC_URL || base.rpc };
const chain = id === "gnosis" ? gnosis : anvilChain(deployment);
if (deployment.chainId !== chain.id)
  throw new Error("Deployment chain does not match the keeper network");
const key = (process.env.KEEPER_PRIVATE_KEY || (id === "local" ? ANVIL_KEY_9 : "")) as Hex;
if (!key) throw new Error("KEEPER_PRIVATE_KEY is required off local chains");

// Batched: a tick reads every pending mission.
const transport = http(deployment.rpc, { batch: { batchSize: 100 } });
const client = createPublicClient({ chain, transport }) as PublicClient;
if ((await client.getChainId()) !== chain.id) throw new Error("Keeper RPC is on the wrong chain");
const account = privateKeyToAccount(key);
const wallet = createWalletClient({ chain, transport, account });
// Only raw transaction submission uses the private RPC; reads stay on the regular provider.
const revealRpc = process.env.REVEAL_RPC_URL;
if (id === "gnosis" && !revealRpc)
  throw new Error("REVEAL_RPC_URL is required for private reveals on Gnosis (B-22)");
if (
  revealRpc &&
  (await createPublicClient({ transport: http(revealRpc) }).getChainId()) !== chain.id
)
  throw new Error("Private reveal RPC is on the wrong chain");
const revealWallet = revealRpc
  ? createWalletClient({ chain, transport: http(revealRpc), account })
  : wallet;
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
  const sender = functionName === "reveal" ? revealWallet : wallet;
  const hash = await sender.writeContract({
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
  const batch = id === "gnosis" ? 1 : sim.MAX_MISSIONS_PER_TX;
  try {
    await call("advance", [BigInt(batch)]);
    console.log("advanced the mission queue");
    return;
  } catch (e) {
    console.warn("advance in a batch failed, one at a time:", (e as Error).message.split("\n")[0]);
  }
  for (let i = 0; i < batch; i++) {
    try {
      await call("advance", [1n]);
      console.log("advanced one mission");
    } catch (e) {
      console.warn("advance failed:", (e as Error).message.split("\n")[0]);
      return;
    }
  }
}

console.log(
  `keeper ${account.address} for ${game} on ${chain.name} (${deployment.rpc}), timelock ${id === "local" ? "plain" : "drand"}`,
);
for (;;) {
  try {
    await tick();
  } catch (e) {
    console.error("tick failed:", (e as Error).message.split("\n")[0]);
  }
  await new Promise((r) => setTimeout(r, TICK_MS));
}

// Keeper (B-22, B-08): reveals hidden missions as soon as their timelock opens and processes due
// missions, so the global queue does not wait for a player to act. It holds no secret: anyone may
// run one, and clients reveal on their own when it is down.
//
// Usage: tsx scripts/keeper.ts <deployment.json> [local|arbitrum]
//   KEEPER_PRIVATE_KEY  the account that pays the gas (default: anvil's account 9, local only)
//   RPC_URL             overrides the deployment's rpc
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum } from "viem/chains";
import { sim, vendetta as rs } from "@vendetta/rules";
import { gameAbi } from "../src/chain/abi.js";
import { anvilChain } from "../src/chain/config.js";
import { ciphertextOf, timelockFor } from "../src/chain/hidden.js";
import type { Deployment, Network, NetworkId } from "../src/chain/networks.js";

const ANVIL_KEY_9 = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";
const TICK_MS = 2000;

const [file, id = "local"] = process.argv.slice(2);
if (!file) throw new Error("usage: keeper.ts <deployment.json> [local|arbitrum]");
const base = JSON.parse(readFileSync(file, "utf8")) as Deployment;
const deployment: Deployment = { ...base, rpc: process.env.RPC_URL || base.rpc };
const chain = id === "arbitrum" ? arbitrum : anvilChain(deployment);
const key = (process.env.KEEPER_PRIVATE_KEY || (id === "local" ? ANVIL_KEY_9 : "")) as Hex;
if (!key) throw new Error("KEEPER_PRIVATE_KEY is required off local chains");

const transport = http(deployment.rpc);
const client = createPublicClient({ chain, transport }) as PublicClient;
const wallet = createWalletClient({ chain, transport, account: privateKeyToAccount(key) });
const timelock = timelockFor({ id: id as NetworkId } as Network);
const game = deployment.game;

type M = {
  hidden: boolean;
  returning: boolean;
  arrival: number;
  seq: bigint;
};

const read = <T>(functionName: string, args: unknown[] = []) =>
  client.readContract({ address: game, abi: gameAbi, functionName, args } as never) as Promise<T>;

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

/** Missions whose reveal reverted (a wrong plaintext): left to the forfeit. */
const failed = new Set<bigint>();

async function tick(): Promise<void> {
  const now = (await client.getBlock()).timestamp;
  const ids = await read<readonly bigint[]>("pendingMissions");
  const missions = await Promise.all(
    ids.map(async (id) => [id, await read<M>("getMission", [id])] as const),
  );
  for (const [id, m] of missions) {
    if (!m.hidden || m.returning || BigInt(m.arrival) > now || failed.has(id)) continue;
    const c = await ciphertextOf(client, game, deployment.fromBlock, id);
    const p = c && (await timelock.decrypt(c)); // null while the round is not out, or garbage
    if (!p) continue;
    const { city, neighborhood, slot } = p.target;
    const salt = `0x${p.salt.toString(16).padStart(64, "0")}`;
    try {
      await call("reveal", [id, p.kind, [city, neighborhood, slot], salt]);
      console.log(`revealed mission ${id}`);
    } catch (e) {
      failed.add(id);
      console.warn(`mission ${id} does not reveal:`, (e as Error).message.split("\n")[0]);
    }
  }
  // Process what is due, unless the head still waits for its reveal within the grace.
  const head = [...missions]
    .map(([, m]) => m)
    .sort((a, b) => a.arrival - b.arrival || (a.seq < b.seq ? -1 : 1))[0];
  if (!head || BigInt(head.arrival) > now) return;
  // A head revealed in this tick still reads as hidden here: it is processed on the next one.
  const grace = BigInt(head.arrival) + rs.config.hiddenRevealGrace;
  if (head.hidden && !head.returning && now < grace) return;
  await call("advance", [BigInt(sim.MAX_MISSIONS_PER_TX)]);
  console.log("advanced the mission queue");
}

console.log(
  `keeper for ${game} on ${chain.name} (${deployment.rpc}), timelock ${id === "arbitrum" ? "drand" : "plain"}`,
);
for (;;) {
  try {
    await tick();
  } catch (e) {
    console.error("tick failed:", (e as Error).message.split("\n")[0]);
  }
  await new Promise((r) => setTimeout(r, TICK_MS));
}

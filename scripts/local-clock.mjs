// Accelerate Anvil's clock without changing the shared game rules.
import { setTimeout } from "node:timers/promises";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const requireWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createPublicClient, http } = requireWeb("viem");
const { abi } = JSON.parse(await readFile(new URL("../contracts/out/Game.sol/Game.json", import.meta.url)));
const deployment = JSON.parse(await readFile(new URL("../apps/web/public/deployment.local.json", import.meta.url)));

const rpc = process.argv[2] ?? "http://127.0.0.1:8545";
const speed = Number(process.env.LOCAL_GAME_SPEED ?? 500);
const client = createPublicClient({ transport: http(rpc) });

// Stop accelerated time at hidden arrivals so the keeper gets real time to reveal them.
async function safeExtra(wanted) {
  const read = (functionName, args = []) => client.readContract({
    address: deployment.game, abi, functionName, args,
  });
  const [pending, parked, block] = await Promise.all([
    read("pendingMissions"), read("parkedMissions"), client.getBlock(),
  ]);
  const missions = await Promise.all([...pending, ...parked].map((id) => read("getMission", [id])));
  let extra = wanted;
  for (const m of missions) {
    if (!m.hidden || m.returning) continue;
    const until = Number(BigInt(m.arrival) - block.timestamp);
    extra = Math.min(extra, Math.max(0, until));
  }
  return extra;
}
if (!Number.isSafeInteger(speed) || speed < 1) {
  throw new Error("LOCAL_GAME_SPEED must be a positive integer");
}

async function request(method, params = []) {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

if (BigInt(await request("eth_chainId")) !== 31337n) {
  throw new Error("The accelerated clock requires the local Anvil chain (31337)");
}
console.log(`Local game clock: ${speed}x`);
let previous = performance.now();
let remainder = 0;
while (speed > 1) {
  await setTimeout(1000);
  const current = performance.now();
  // Anvil already advances at wall-clock speed; add only the extra elapsed seconds.
  remainder += ((current - previous) / 1000) * (speed - 1);
  previous = current;
  const wanted = Math.floor(remainder);
  remainder -= wanted;
  // Discard paused acceleration: catching it up would skip subsequent reveal windows.
  const extra = await safeExtra(wanted);
  if (extra > 0) {
    await request("evm_increaseTime", [extra]);
    await request("evm_mine");
  }
}

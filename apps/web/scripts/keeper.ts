import { requestCertificate } from "../src/chain/certificates.js";
// Certificate keeper: operation failures are retried, never converted to invalidity or timeouts.
// Usage: HIDDEN_PROVER_URL=http://... KEEPER_PRIVATE_KEY=... tsx scripts/keeper.ts deployment.json
import { keeperTransactions } from "./keeper/transactions.js";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { gameAbi } from "../src/chain/abi.js";
import { CiphertextIndex } from "../src/chain/hidden.js";
import { decodePacket } from "../src/chain/codec.js";
import { decodeHiddenEvidence } from "../src/chain/hidden-evidence.js";
import { fromHex } from "viem";
import type { Deployment } from "../src/chain/networks.js";
const [file] = process.argv.slice(2);
if (!file) throw new Error("usage: keeper.ts deployment.json");
const deployment = JSON.parse(readFileSync(file, "utf8")) as Deployment;
const rpc = process.env.RPC_URL || deployment.rpc;
const prover = process.env.HIDDEN_PROVER_URL;
if (!prover)
  throw new Error("HIDDEN_PROVER_URL is required: the keeper only submits verified certificates");
const proverToken = process.env.HIDDEN_PROVER_TOKEN;
if (!proverToken) throw new Error("HIDDEN_PROVER_TOKEN is required");
const key = process.env.KEEPER_PRIVATE_KEY as Hex | undefined;
if (!key) throw new Error("KEEPER_PRIVATE_KEY is required");
const client = createPublicClient({
  transport: http(rpc, { timeout: 15000, retryCount: 0 }),
  cacheTime: 0,
});
if ((await client.getChainId()) !== deployment.chainId) throw new Error("Wrong keeper chain");
const wallet = createWalletClient({
  transport: http(rpc, { timeout: 15000, retryCount: 0 }),
  account: privateKeyToAccount(key),
});
const game = deployment.game,
  ciphertexts = new CiphertextIndex(client, game, deployment.fromBlock);
const read = <T>(functionName: string, args: unknown[] = []) =>
  client.readContract({ address: game, abi: gameAbi, functionName, args } as never) as Promise<T>;
const stateDir = resolve(
  process.env.KEEPER_STATE_DIR ||
    join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "vendetta", "keeper"),
);
await mkdir(stateDir, { recursive: true, mode: 0o700 });
const transactions = keeperTransactions(
  join(
    stateDir,
    `keeper-${deployment.chainId}-${game.toLowerCase()}-${wallet.account.address.toLowerCase()}.json`,
  ),
  {
    simulate: async ({ functionName, args }) => {
      await client.simulateContract({
        address: game,
        abi: gameAbi,
        functionName,
        args,
        account: wallet.account,
        gas: 12000000n,
      } as never);
    },
    prepare: async ({ functionName, args }) => {
      const request = await wallet.prepareTransactionRequest({
        chain: null,
        chainId: deployment.chainId,
        to: game,
        data: encodeFunctionData({ abi: gameAbi, functionName, args } as never),
        gas: 12000000n,
      });
      return wallet.signTransaction({ ...request, chain: null });
    },
    broadcast: (serializedTransaction) => client.sendRawTransaction({ serializedTransaction }),
    receipt: async (hash) =>
      (await client.waitForTransactionReceipt({ hash, timeout: 60000, pollingInterval: 1000 }))
        .status,
  },
);
async function call(functionName: string, args: unknown[]) {
  await transactions.send({ functionName, args });
}

async function tick() {
  // Settle ambiguous sends before reading mission state or preparing another nonce.
  await transactions.recover();
  await ciphertexts.catchUp();
  const pending = await read<readonly bigint[]>("pendingMissions");
  const missions = await Promise.all(
    pending.map(async (id) => ({ id, m: await read<any>("getMission", [id]) })),
  );
  missions.sort((a, b) => a.m.arrival - b.m.arrival || (a.m.seq < b.m.seq ? -1 : 1));
  const now = (await client.getBlock()).timestamp;
  for (const { id, m } of missions) {
    if (BigInt(m.arrival) > now) break;
    if (!m.hidden || m.returning) continue;
    const e = decodeHiddenEvidence(await read<Hex>("getHiddenEvidence", [id]));
    if (!e) throw new Error(`Missing binding for mission ${id}`);
    if (e.receipt.status !== 1) continue;
    const packet = await ciphertexts.get(id);
    if (!packet) throw new Error(`Mission ${id}: packet not indexed; retrying`);
    const parsed = decodePacket(fromHex(packet, "bytes"));
    if (!parsed) throw new Error(`Mission ${id}: inconsistent admitted framing`);
    if (now < 1692803367n + (parsed.round - 1n) * 3n) continue;
    // The prover prepares H3 prefix state on its consumer and returns a complete certificate.
    const certificate = await requestCertificate(
      prover!,
      {
        chainId: deployment.chainId,
        game,
        mission: String(id),
        statement: e.receipt.statement,
        packet,
        context: m,
      },
      fetch,
      proverToken,
    );
    await call("submitHiddenEvidence", [id, certificate]);
    console.log(`certificate submitted for mission ${id}`);
  }
  if (missions.some(({ m }) => BigInt(m.arrival) <= now)) await call("advance", [1n]);
}
console.log(`certificate keeper for ${game}; proof service ${new URL(prover).origin}`);
for (;;) {
  try {
    await tick();
  } catch (e) {
    console.warn("keeper will retry:", (e as Error).message.split("\n")[0]);
  }
  await new Promise((r) => setTimeout(r, 2000));
}

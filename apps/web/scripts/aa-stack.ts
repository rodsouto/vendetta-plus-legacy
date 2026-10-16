// Local ERC-4337 stack for passkey accounts (4b.3): a plain anvil with the account contracts of
// Arbitrum One installed at their real addresses (EntryPoint 0.7, Kernel v3.1 and its WebAuthn
// validator, the P-256 verifier, SimpleAccount; snapshot in aa-contracts.json, see aa-fixture.ts),
// the Game deployed, the Alto bundler and Pimlico's mock paymaster (sponsors everything). Then the
// web app, pointed at it. No fork: public RPCs drop old state within minutes, and this way it runs
// offline and in CI.
//
//   tsx scripts/aa-stack.ts [--base 8545] [--vite 5173] [--public] [--indexer 8500]
//
// Ports: anvil = base, bundler = base + 1, paymaster = base + 2. --public writes
// public/deployment.local.json (pnpm dev:aa); otherwise the deployment goes to Vite through
// VITE_DEPLOYMENT (isolated e2e runs). --indexer also starts the subgraph on a local graph-node
// (Docker, packages/indexer/scripts/local.sh) with its GraphQL on that port.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createPublicClient, http, type Hex } from "viem";
import { paymaster } from "@pimlico/mock-paymaster";
import { DEV_KEYS } from "../src/chain/config.js";
import type { Deployment } from "../src/chain/networks.js";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const contracts = join(web, "../../contracts");
const { values } = parseArgs({
  options: {
    base: { type: "string", default: "8545" },
    vite: { type: "string", default: "5173" },
    public: { type: "boolean", default: false },
    indexer: { type: "string" },
  },
});
const base = Number(values.base);
// Anvil's mnemonic accounts 8 and 9: the bundler's utility and executor wallets.
const UTILITY_KEY = "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97";
const EXECUTOR_KEY = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";
const ENTRY_POINT_07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

const anvilRpc = `http://127.0.0.1:${base}`;
const bundlerRpc = `http://127.0.0.1:${base + 1}`;
const paymasterRpc = `http://127.0.0.1:${base + 2}`;

const indexerSh = join(web, "../../packages/indexer/scripts/local.sh");
const children: ChildProcess[] = [];
const stop = () => {
  for (const c of children) c.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("exit", () => {
  children.forEach((c) => c.kill());
  if (values.indexer) execFileSync("bash", [indexerSh, "down", values.indexer]);
});

const run = (cmd: string, args: string[], env: NodeJS.ProcessEnv = {}, quiet = true) => {
  const child = spawn(cmd, args, {
    cwd: web,
    env: { ...process.env, ...env },
    stdio: quiet ? "ignore" : "inherit",
  });
  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`${cmd} exited with ${code}`);
      stop();
    }
  });
  children.push(child);
  return child;
};

async function until(what: string, ok: () => Promise<unknown>, tries = 300) {
  for (let i = 0; i < tries; i++) {
    try {
      if (await ok()) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${what} did not start`);
}

const rpcUp = (url: string, method: string) => () =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
  }).then((r) => r.ok);

// On 0.0.0.0 when graph-node (in a container) has to reach it.
run("anvil", [
  ...(values.indexer ? ["--host", "0.0.0.0"] : []),
  "--port",
  String(base),
  "--silent",
]);
await until("anvil", rpcUp(anvilRpc, "eth_chainId"));

const client = createPublicClient({ transport: http(anvilRpc) });
const fixture = JSON.parse(readFileSync(join(web, "scripts/aa-contracts.json"), "utf8")) as {
  contracts: { address: Hex; code: Hex; storage: Record<Hex, Hex> }[];
};
const anvil = (method: string, params: unknown[]) =>
  client.request({ method: method as never, params: params as never });
for (const c of fixture.contracts) {
  await anvil("anvil_setCode", [c.address, c.code]);
  for (const [slot, value] of Object.entries(c.storage))
    await anvil("anvil_setStorageAt", [c.address, slot, value]);
}

execFileSync(
  "forge",
  [
    "script",
    "script/Deploy.s.sol",
    "--rpc-url",
    anvilRpc,
    "--private-key",
    DEV_KEYS[0],
    "--broadcast",
  ],
  { cwd: contracts, stdio: "ignore" },
);
const chainId = await client.getChainId();
const broadcast = JSON.parse(
  readFileSync(join(contracts, `broadcast/Deploy.s.sol/${chainId}/run-latest.json`), "utf8"),
) as { transactions: { contractName: string; contractAddress: `0x${string}` }[] };
const deployed = (name: string) =>
  broadcast.transactions.find((t) => t.contractName === name)!.contractAddress;

run(join(web, "node_modules/.bin/alto"), [
  "--entrypoints",
  ENTRY_POINT_07,
  "--rpc-url",
  anvilRpc,
  "--executor-private-keys",
  EXECUTOR_KEY,
  "--utility-private-key",
  UTILITY_KEY,
  "--safe-mode",
  "false",
  "--deploy-simulations-contract",
  "true",
  "--enable-cors",
  "true",
  "--expiration-check",
  "false",
  "--log-level",
  "warn",
  "--port",
  String(base + 1),
]);
await until("bundler", rpcUp(bundlerRpc, "eth_supportedEntryPoints"));
await paymaster({ anvilRpc, altoRpc: bundlerRpc, port: base + 2, host: "127.0.0.1" }).start();

const deployment: Deployment = {
  chainId,
  rpc: anvilRpc,
  game: deployed("ERC1967Proxy"),
  directory: deployed("PasskeyDirectory"),
  fromBlock: Number(await client.getBlockNumber()),
  bundler: bundlerRpc,
  paymaster: paymasterRpc,
};
console.log(`Game ${deployment.game} on anvil (chain ${chainId}) (${anvilRpc})`);
console.log(`bundler ${bundlerRpc}, paymaster ${paymasterRpc}`);
if (values.indexer) {
  const out = execFileSync(
    "bash",
    [indexerSh, "up", values.indexer, String(base), deployment.game, String(deployment.fromBlock)],
    { encoding: "utf8" },
  );
  deployment.indexer = out.trim().split("\n").at(-1);
  console.log(`indexer ${deployment.indexer}`);
}

const env: NodeJS.ProcessEnv = {};
if (values.public)
  writeFileSync(join(web, "public/deployment.local.json"), JSON.stringify(deployment, null, 2));
else env.VITE_DEPLOYMENT = JSON.stringify(deployment);
run(join(web, "node_modules/.bin/vite"), ["--port", values.vite!, "--strictPort"], env, false);

// Starts an anvil node and deploys the Game, for tests that need a real chain.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, readFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, type Address } from "viem";
import { DEV_KEYS, makeClients, type Clients } from "../src/chain/config.js";

// Local chain: every role is account 0 (B-17); exported ADMIN/OPERATOR/ARBITER are for real deploys.
const localDeployEnv = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !["ADMIN", "OPERATOR", "ARBITER"].includes(k)),
  );

const contracts = join(dirname(fileURLToPath(import.meta.url)), "../../../contracts");

export async function startChain(port: number): Promise<{ clients: Clients; stop: () => void }> {
  const broadcastRoot = mkdtempSync(join(tmpdir(), "vendetta-test-broadcast-"));
  const cacheRoot = join(broadcastRoot, "cache");
  mkdirSync(cacheRoot);
  const compiled = join(contracts, "cache/solidity-files-cache.json");
  if (existsSync(compiled)) copyFileSync(compiled, join(cacheRoot, "solidity-files-cache.json"));
  const anvil: ChildProcess = spawn("anvil", ["--port", String(port), "--silent"], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let anvilLog = "";
  anvil.stderr?.on("data", (chunk: Buffer) => {
    anvilLog = (anvilLog + chunk.toString()).slice(-65536);
  });
  try {
    const rpc = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) {
      try {
        execFileSync("cast", ["block-number", "--rpc-url", rpc], { stdio: "ignore" });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    execFileSync(
      "forge",
      [
        "script",
        "script/DeployTest.s.sol",
        "--rpc-url",
        rpc,
        "--private-key",
        DEV_KEYS[0],
        "--broadcast",
      ],
      {
        cwd: contracts,
        stdio: "pipe",
        env: {
          ...localDeployEnv(),
          FOUNDRY_BROADCAST: broadcastRoot,
          FOUNDRY_CACHE_PATH: cacheRoot,
        },
      },
    );
    const run = JSON.parse(
      readFileSync(join(broadcastRoot, "DeployTest.s.sol/31337/run-latest.json"), "utf8"),
    );
    const game = run.transactions.find(
      (t: { contractName: string }) => t.contractName === "ERC1967Proxy",
    ).contractAddress as Address;
    const clients = makeClients({ chainId: 31337, rpc, game, fromBlock: 0 });
    // Tests read immediately after mining; a cached head can hide the transaction just confirmed.
    clients.public = createPublicClient({
      chain: clients.chain,
      transport: http(rpc),
      cacheTime: 0,
    });
    return {
      clients,
      stop: () => {
        anvil.kill();
        rmSync(broadcastRoot, { recursive: true, force: true });
      },
    };
  } catch (error) {
    anvil.kill();
    rmSync(broadcastRoot, { recursive: true, force: true });
    const detail = error as Error & { stdout?: Buffer; stderr?: Buffer; signal?: string };
    throw new Error(
      `${detail.message}\nSignal: ${detail.signal ?? "none"}\n${detail.stdout?.toString() ?? ""}\n${detail.stderr?.toString() ?? ""}\nAnvil: ${anvilLog}`,
    );
  }
}

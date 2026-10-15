// Starts an anvil node and deploys the Game, for tests that need a real chain.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Address } from "viem";
import { DEV_KEYS, makeClients, type Clients } from "../src/chain/config.js";

const contracts = join(dirname(fileURLToPath(import.meta.url)), "../../../contracts");

export async function startChain(port: number): Promise<{ clients: Clients; stop: () => void }> {
  const anvil: ChildProcess = spawn("anvil", ["--port", String(port), "--silent"], {
    stdio: "ignore",
  });
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
      "script/Deploy.s.sol",
      "--rpc-url",
      rpc,
      "--private-key",
      DEV_KEYS[0],
      "--broadcast",
    ],
    { cwd: contracts, stdio: "ignore" },
  );
  const run = JSON.parse(
    readFileSync(join(contracts, "broadcast/Deploy.s.sol/31337/run-latest.json"), "utf8"),
  );
  const game = run.transactions.find(
    (t: { contractName: string }) => t.contractName === "ERC1967Proxy",
  ).contractAddress as Address;
  const clients = makeClients({ chainId: 31337, rpc, game, fromBlock: 0 });
  return { clients, stop: () => anvil.kill() };
}

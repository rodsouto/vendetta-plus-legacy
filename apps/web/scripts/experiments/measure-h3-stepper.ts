// Isolated EVM experiment. No Game deployment and no authenticated-opening verifier adapter.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  toHex,
  type Abi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const work = resolve(process.argv[2] ?? "/tmp/vendetta-opening-tools/h3-stepper-run");
const source = join(root, "apps/web/scripts/experiments/h3-stepper");
const output = join(root, "docs/benchmarks/timelock-opening");
const probe = JSON.parse(readFileSync(join(output, "h3-bound-probe.json"), "utf8")) as {
  sigma: string;
  fileKey: string;
  scalar: string;
  firstAcceptedCounter: number;
};
const preHash =
  "0x" +
  createHash("sha256")
    .update("IBE-H3")
    .update(Buffer.from(probe.sigma, "hex"))
    .update(Buffer.from(probe.fileKey, "hex"))
    .digest("hex");
for (const p of ["src", "test"]) mkdirSync(join(work, p), { recursive: true });
copyFileSync(join(source, "H3Prefix.sol"), join(work, "src/H3Prefix.sol"));
writeFileSync(
  join(work, "test/H3Prefix.t.sol"),
  readFileSync(join(source, "H3Prefix.t.sol"), "utf8").replace(
    'from "./H3Prefix.sol"',
    'from "../src/H3Prefix.sol"',
  ),
);
writeFileSync(join(work, "fixture.json"), JSON.stringify({ preHash, ...probe }, null, 2) + "\n");
writeFileSync(
  join(work, "foundry.toml"),
  '[profile.default]\nsrc="src"\ntest="test"\nsolc_version="0.8.28"\nevm_version="cancun"\noptimizer=true\noptimizer_runs=200\nfs_permissions=[{access="read",path="./fixture.json"}]\n',
);
const forge = process.env.FORGE_BIN ?? join(homedir(), ".foundry/bin/forge");
const solc = process.env.SOLC_BIN ? ["--use", process.env.SOLC_BIN] : [];
const r = spawnSync(forge, ["test", "--root", work, ...solc, "-vv"], {
  cwd: work,
  encoding: "utf8",
  timeout: 300000,
});
writeFileSync(join(work, "test-output.log"), r.stdout + r.stderr);
if (r.status !== 0) throw new Error(r.stdout + r.stderr + String(r.error ?? ""));
const gas = (name: string) => {
  const m = r.stdout.match(new RegExp(`${name}:\\s*(\\d+)`));
  if (!m) throw new Error(`Missing ${name}`);
  return Number(m[1]);
};
const compiled = JSON.parse(readFileSync(join(work, "out/H3Prefix.sol/H3Prefix.json"), "utf8")) as {
  deployedBytecode: { object: string };
  bytecode: { object: string };
  abi: Abi;
};
if (!/9 tests passed, 0 failed, 0 skipped/.test(r.stdout))
  throw new Error("Expected nine EVM tests without skips");
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const report = {
  scope:
    "Research H3 state machine only; receipt admitter is a trusted stub, NOT a verified pre/mission binding",
  evm: "cancun",
  solc: "0.8.28",
  optimizerRuns: 200,
  testsPassed: 9,
  preHash,
  nativeFirstAcceptedCounter: probe.firstAcceptedCounter,
  nativeScalar: probe.scalar,
  maxPerCall: 128,
  lastActualCandidate: 65534,
  receiptInitializationAuthenticatedByZk: false,
  productionIntegrated: false,
  gas: {
    rejectFirstFour: gas("h3_reject_four_gas"),
    acceptFifthSeparateCall: gas("h3_accept_fifth_gas"),
    firstFiveInOneCall: gas("h3_first_five_one_call_gas"),
    forcedHashRejection128: gas("h3_forced_hash_reject_128_gas"),
  },
  gasScope:
    "In-test call gas including caller overhead; not total transaction fees, Gnosis deployment, or full opening proof. Forced 128 uses a test override retaining SHA; full exhaustion uses mock candidates, not a SHA preimage.",
  deployedBytecodeBytes: compiled.deployedBytecode.object.replace(/^0x/, "").length / 2,
  sourceSha256: sha(readFileSync(join(source, "H3Prefix.sol"))),
  testSourceSha256: sha(readFileSync(join(source, "H3Prefix.t.sol"))),
  testOutputSha256: sha(readFileSync(join(work, "test-output.log"))),
};
// Separate Anvil transactions include intrinsic gas and fresh-transaction storage costs.
const listener = createServer();
await new Promise<void>((resolve, reject) => {
  listener.once("error", reject);
  listener.listen(0, "127.0.0.1", resolve);
});
const port = (listener.address() as { port: number }).port;
await new Promise<void>((resolve, reject) =>
  listener.close((err) => (err ? reject(err) : resolve())),
);
const anvil = spawn(
  join(dirname(forge), "anvil"),
  ["--port", String(port), "--host", "127.0.0.1", "--chain-id", "31337", "--hardfork", "cancun"],
  { stdio: ["ignore", "pipe", "pipe"] },
);
try {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Anvil readiness timed out")), 10000);
    anvil.once("error", (e) => {
      clearTimeout(timeout);
      reject(e);
    });
    anvil.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Anvil exited before measurement: ${code}`));
    });
    let text = "";
    anvil.stdout!.on("data", (chunk) => {
      text += String(chunk);
      if (text.includes(`Listening on 127.0.0.1:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  const rpc = `http://127.0.0.1:${port}`;
  const chain = defineChain({
    id: 31337,
    name: "H3 research Anvil",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  });
  // Public Anvil development key, used only against the fresh child process above.
  const account = privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  );
  const pub = createPublicClient({ chain, transport: http(rpc), cacheTime: 0 });
  const wallet = createWalletClient({ chain, transport: http(rpc), account });
  const receipt = async (hash: Hex) => {
    const r = await pub.waitForTransactionReceipt({ hash, pollingInterval: 10 });
    if (r.status !== "success") throw new Error("Anvil transaction reverted");
    return r;
  };
  const deployed = await receipt(
    await wallet.deployContract({
      abi: compiled.abi,
      bytecode: ("0x" + compiled.bytecode.object.replace(/^0x/, "")) as Hex,
      args: [account.address],
    }),
  );
  const address = deployed.contractAddress!;
  const begin = async (n: bigint) =>
    receipt(
      await wallet.writeContract({
        address,
        abi: compiled.abi,
        functionName: "begin",
        args: [toHex(n, { size: 32 }), toHex(1n, { size: 32 }), preHash as Hex],
      }),
    );
  const read = async (n: bigint) =>
    pub.readContract({
      address,
      abi: compiled.abi,
      functionName: "receiptForContext",
      args: [toHex(n, { size: 32 })],
    }) as Promise<Hex>;
  const advance = async (id: Hex, budget: number) =>
    receipt(
      await wallet.writeContract({
        address,
        abi: compiled.abi,
        functionName: "advance",
        args: [id, budget],
      }),
    );
  const initialized = await begin(1n);
  const id = await read(1n);
  const four = await advance(id, 4);
  const partial = (await pub.readContract({
    address,
    abi: compiled.abi,
    functionName: "states",
    args: [id],
  })) as readonly [Hex, bigint, number, number, number];
  if (partial[2] !== 5 || partial[4] !== 1) throw new Error("Anvil prefix state disagrees");
  const fifth = await advance(id, 1);
  const finalState = (await pub.readContract({
    address,
    abi: compiled.abi,
    functionName: "states",
    args: [id],
  })) as readonly [Hex, bigint, number, number, number];
  if (finalState[1] !== BigInt(probe.scalar) || finalState[3] !== 5 || finalState[4] !== 2)
    throw new Error("Anvil scalar disagrees with native tlock");
  await begin(2n);
  const together = await advance(await read(2n), 128);
  Object.assign(report, {
    anvilTransactionGas: {
      stubDeployment: String(deployed.gasUsed),
      stubInitialization: String(initialized.gasUsed),
      rejectFirstFour: String(four.gasUsed),
      acceptFifthSeparateTransaction: String(fifth.gasUsed),
      firstFiveOneTransaction: String(together.gasUsed),
    },
    anvilMeasurementScope:
      "Separate local transactions on a fresh private Anvil instance; initialization authenticates only the test admitter, not an opening proof. No Gnosis deployment.",
  });
} finally {
  anvil.kill();
}
writeFileSync(join(output, "h3-stepper-results.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));

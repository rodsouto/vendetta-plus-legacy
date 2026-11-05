// Research-only composition with a real locally generated Groth16 verifier.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Abi,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const src = join(root, "apps/web/scripts/experiments/h3-stepper");
const artifacts = join(root, "docs/benchmarks/timelock-opening/invalid-point-proof");
const work = resolve(
  process.argv[2] ?? "/tmp/vendetta-opening-tools/invalid-point-proof-proof-evm",
);
for (const dir of ["src", "test"]) mkdirSync(join(work, dir), { recursive: true });
for (const name of ["InvalidPointV2Consumer.sol"])
  copyFileSync(join(src, name), join(work, "src", name));
copyFileSync(join(artifacts, "PairingVerifier.sol"), join(work, "src/InvalidPointV2Verifier.sol"));
for (const name of ["InvalidPointV2Proof.t.sol"]) {
  const text = readFileSync(join(src, name), "utf8").replaceAll('from "./', 'from "../src/');
  writeFileSync(join(work, "test", name), text);
}
for (const name of ["proof.json", "torsion-proof.json"])
  copyFileSync(join(artifacts, name), join(work, name));
writeFileSync(
  join(work, "foundry.toml"),
  '[profile.default]\nsrc="src"\ntest="test"\nevm_version="cancun"\noptimizer=true\noptimizer_runs=200\nfs_permissions=[{access="read",path="./proof.json"},{access="read",path="./torsion-proof.json"}]\n',
);
const extra = process.env.SOLC_BIN ? ["--use", process.env.SOLC_BIN] : [];
const result = spawnSync(
  process.env.FORGE_BIN ?? join(homedir(), ".foundry/bin/forge"),
  ["test", "--root", work, ...extra, "-vv"],
  { encoding: "utf8", timeout: 300000 },
);
writeFileSync(join(work, "test-output.log"), result.stdout + result.stderr);
if (result.status !== 0)
  throw new Error(result.stdout + result.stderr + String(result.error ?? ""));
if (!/6 tests passed, 0 failed, 0 skipped/.test(result.stdout))
  throw new Error("Expected six tests");
const compiled = JSON.parse(
  readFileSync(join(work, "out/InvalidPointV2Verifier.sol/Verifier.json"), "utf8"),
) as { deployedBytecode: { object: string } };
const bytes = compiled.deployedBytecode.object.replace(/^0x/, "").length / 2;
if (bytes > 24576) throw new Error("Verifier exceeds EIP170");
const report = {
  scope:
    "Real invalid-U v2 certificates with exact stored statement; no H3, beacon or Game effects",
  testsPassed: 6,
  verifierCallGasCap: 2_000_000,
  verifierDeployedBytes: bytes,
  evm: "cancun",
  solc: "0.8.28",
  optimizerRuns: 200,
  productionIntegrated: false,
  setup: "Local unsafe research setup; never reuse in production",
  verifierSourceSha256: createHash("sha256")
    .update(readFileSync(join(artifacts, "PairingVerifier.sol")))
    .digest("hex"),
};
const forge = process.env.FORGE_BIN ?? join(homedir(), ".foundry/bin/forge");
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
    name: "Mission proof research Anvil",
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
  const artifact = (file: string, name: string) =>
    JSON.parse(readFileSync(join(work, `out/${file}/${name}.json`), "utf8")) as {
      abi: Abi;
      bytecode: { object: string };
    };
  const verifierArtifact = artifact("InvalidPointV2Verifier.sol", "Verifier"),
    consumerArtifact = artifact("InvalidPointV2Consumer.sol", "InvalidPointV2Consumer");
  const deploy = async (a: typeof verifierArtifact, args: unknown[]) =>
    receipt(
      await wallet.deployContract({
        abi: a.abi,
        bytecode: ("0x" + a.bytecode.object.replace(/^0x/, "")) as Hex,
        args,
      }),
    );
  const verifierReceipt = await deploy(verifierArtifact, []);
  const consumerReceipt = await deploy(consumerArtifact, [verifierReceipt.contractAddress!]);
  const address = consumerReceipt.contractAddress!;
  const write = async (to: Address, abi: Abi, fn: string, args: unknown[]) =>
    receipt(
      await wallet.writeContract({ address: to, abi, functionName: fn, args, gas: 3_000_000n }),
    );
  const gas: Record<string, string> = {
    verifierDeployment: String(verifierReceipt.gasUsed),
    consumerDeployment: String(consumerReceipt.gasUsed),
  };
  for (const [name, file] of [
    ["invalidCompression", "proof.json"],
    ["order13Torsion", "torsion-proof.json"],
  ] as const) {
    const data = JSON.parse(readFileSync(join(work, file), "utf8")) as {
      proof: Hex;
      publicInputs: string[];
      statement: Hex;
    };
    const x = data.publicInputs.map(BigInt);
    const args = [data.statement, data.proof, x];
    const invalid = await pub.readContract({
      address,
      abi: consumerArtifact.abi,
      functionName: "check",
      args,
    });
    if (invalid !== true) throw new Error("Anvil rejected real invalid-point certificate");
    gas[name + "Verification"] = String(
      (await write(address, consumerArtifact.abi, "check", args)).gasUsed,
    );
  }
  Object.assign(report, {
    anvilTransactionGas: gas,
    anvilMeasurementScope:
      "Separate transactions on a fresh private Cancun Anvil; invalid-U certificates and exact immutable context checked. No Gnosis deployment.",
  });
} finally {
  anvil.kill();
}
writeFileSync(join(artifacts, "evm-results.json"), JSON.stringify(report, null, 2) + "\n");
console.log(result.stdout);
console.log(JSON.stringify(report));

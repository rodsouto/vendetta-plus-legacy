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
  toHex,
  type Abi,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const src = join(root, "apps/web/scripts/experiments/h3-stepper");
const artifacts = join(root, "docs/benchmarks/timelock-opening/mission-v2-proof");
const work = resolve(process.argv[2] ?? "/tmp/vendetta-opening-tools/mission-v2-proof-proof-evm");
for (const dir of ["src", "test"]) mkdirSync(join(work, dir), { recursive: true });
for (const name of ["H3Prefix.sol", "MissionV2Consumer.sol"])
  copyFileSync(join(src, name), join(work, "src", name));
copyFileSync(join(artifacts, "PairingVerifier.sol"), join(work, "src/MissionV2Verifier.sol"));
for (const name of ["MissionV2Consumer.t.sol", "MissionV2Proof.t.sol"]) {
  const text = readFileSync(join(src, name), "utf8").replaceAll('from "./', 'from "../src/');
  writeFileSync(join(work, "test", name), text);
}
for (const name of ["proof.json", "invalid-proof.json"])
  copyFileSync(join(artifacts, name), join(work, name));
writeFileSync(
  join(work, "foundry.toml"),
  '[profile.default]\nsrc="src"\ntest="test"\nevm_version="cancun"\noptimizer=true\noptimizer_runs=200\nfs_permissions=[{access="read",path="./proof.json"},{access="read",path="./invalid-proof.json"},{access="read",path="./vectors.json"}]\n',
);
copyFileSync(
  join(root, "docs/benchmarks/timelock-opening/codec-v2/vectors.json"),
  join(work, "vectors.json"),
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
if (!/10 tests passed, 0 failed, 0 skipped/.test(result.stdout))
  throw new Error("Expected ten tests");
const compiled = JSON.parse(
  readFileSync(join(work, "out/MissionV2Verifier.sol/Verifier.json"), "utf8"),
) as { deployedBytecode: { object: string } };
const bytes = compiled.deployedBytecode.object.replace(/^0x/, "").length / 2;
if (bytes > 24576) throw new Error("Verifier exceeds EIP170");
const report = {
  scope: "Full fixed v2 mission proof + exact H3 prefix + stored statement; no Game integration",
  testsPassed: 10,
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
  const verifierArtifact = artifact("MissionV2Verifier.sol", "Verifier"),
    consumerArtifact = artifact("MissionV2Consumer.sol", "MissionV2Consumer"),
    prefixArtifact = artifact("H3Prefix.sol", "H3Prefix");
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
  const cache = (await pub.readContract({
    address,
    abi: consumerArtifact.abi,
    functionName: "prefix",
  })) as Address;
  const write = async (to: Address, abi: Abi, fn: string, args: unknown[]) =>
    receipt(
      await wallet.writeContract({ address: to, abi, functionName: fn, args, gas: 3_000_000n }),
    );
  const gas: Record<string, string> = {
    verifierDeployment: String(verifierReceipt.gasUsed),
    consumerDeployment: String(consumerReceipt.gasUsed),
  };
  const vectors = JSON.parse(readFileSync(join(work, "vectors.json"), "utf8")) as {
    vectors: { statement: Hex; rawPlain: string }[];
  };
  for (const [name, index, file] of [
    ["valid", 1, "proof.json"],
    ["invalid", 5, "invalid-proof.json"],
  ] as const) {
    const data = JSON.parse(readFileSync(join(work, file), "utf8")) as {
      proof: Hex;
      publicInputs: string[];
    };
    const x = data.publicInputs.map(BigInt);
    const pre = toHex((x[51]! << 128n) | x[52]!, { size: 32 });
    gas[name + "PrefixInitialization"] = String(
      (await write(address, consumerArtifact.abi, "begin", [pre])).gasUsed,
    );
    const id = (await pub.readContract({
      address: cache,
      abi: prefixArtifact.abi,
      functionName: "receiptForContext",
      args: [pre],
    })) as Hex;
    if (name === "valid") {
      gas.validRejectFour = String(
        (await write(cache, prefixArtifact.abi, "advance", [id, 4])).gasUsed,
      );
      gas.validAcceptFifth = String(
        (await write(cache, prefixArtifact.abi, "advance", [id, 1])).gasUsed,
      );
    } else {
      gas.invalidPrefixAdvance = String(
        (await write(cache, prefixArtifact.abi, "advance", [id, 128])).gasUsed,
      );
    }
    const args = [vectors.vectors[index]!.statement, data.proof, x];
    const result = (await pub.readContract({
      address,
      abi: consumerArtifact.abi,
      functionName: "check",
      args,
    })) as readonly [boolean, Hex];
    const expectedPlain = name === "valid" ? "0x" + vectors.vectors[index]!.rawPlain : "0x";
    if (result[0] !== (name === "valid") || result[1] !== expectedPlain)
      throw new Error("Anvil mission result differs");
    gas[name + "MissionVerification"] = String(
      (await write(address, consumerArtifact.abi, "check", args)).gasUsed,
    );
  }
  Object.assign(report, {
    anvilTransactionGas: gas,
    anvilMeasurementScope:
      "Separate transactions on a fresh private Cancun Anvil; complete mission verification and exact prefix checked. No Gnosis deployment.",
  });
} finally {
  anvil.kill();
}
writeFileSync(join(artifacts, "evm-results.json"), JSON.stringify(report, null, 2) + "\n");
console.log(result.stdout);
console.log(JSON.stringify(report));

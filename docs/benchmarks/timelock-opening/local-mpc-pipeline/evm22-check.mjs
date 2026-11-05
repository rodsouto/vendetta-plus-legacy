import assert from "node:assert/strict";
import { readFileSync, writeFileSync, openSync } from "node:fs";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
} from "/home/rodrigo/orca-projects/vendetta-plus-legacy/apps/web/node_modules/viem/_esm/index.js";
import { privateKeyToAccount } from "/home/rodrigo/orca-projects/vendetta-plus-legacy/apps/web/node_modules/viem/_esm/accounts/index.js";

const root = "/home/rodrigo/.cache/vendetta-audit/local-mpc-invalid-point-proof-20261104-run1";
const compiledRoot = "/home/rodrigo/.cache/vendetta-audit/local-mpc-solidity22-20261104-run1";
const proof = JSON.parse(readFileSync(join(root, "proof.json")));
const input = JSON.parse(readFileSync(join(root, "input.json")));
const nativeReport = JSON.parse(readFileSync(join(root, "report.json")));
const compiled = JSON.parse(readFileSync(join(compiledRoot, "solc-combined.json"))).contracts[
  "src/Verifier.sol:Verifier"
];
const compiledReceipt = JSON.parse(readFileSync(join(compiledRoot, "receipt.json")));
const consumer = JSON.parse(
  readFileSync(
    "/home/rodrigo/orca-projects/vendetta-plus-legacy/contracts/out/InvalidPointV2Consumer.sol/InvalidPointV2Consumer.json",
  ),
);
assert.equal(nativeReport.status, "native-proof-verified");
assert.equal(proof.kind, "invalid-point");
assert.equal(proof.valid, false);
assert.equal(proof.statement, input.statement);
assert.equal(
  proof.setupManifestSha256,
  "c4798b4f3ddc81c535c680a420b437fec9107ea007bc5c39c9504ff86a13a2c8",
);
assert.equal(proof.publicInputs.length, 2);
const x = proof.publicInputs.map(BigInt);
const listener = createServer();
await new Promise((r) => listener.listen(0, "127.0.0.1", r));
const port = listener.address().port;
await new Promise((r) => listener.close(r));
const anvil = "/home/rodrigo/.foundry/bin/anvil";
assert.equal(
  createHash("sha256").update(readFileSync(anvil)).digest("hex"),
  "3c28263c7989c78b70b56090a97832263b118201dd038a8662b77bd49a252cd5",
);
const log = openSync(join(root, "anvil.txt"), "wx");
const child = spawn(
  anvil,
  [
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--chain-id",
    "1337",
    "--hardfork",
    "cancun",
    "--silent",
  ],
  { stdio: ["ignore", log, log] },
);
const chain = defineChain({
  id: 1337,
  name: "Private MPC key interoperability",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [`http://127.0.0.1:${port}`] } },
});
const publicClient = createPublicClient({ chain, transport: http(), cacheTime: 0 });
const wallet = createWalletClient({
  chain,
  transport: http(),
  account: privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  ),
});
const deploy = async (abi, bytecode, args = []) => {
  const hash = await wallet.deployContract({ abi, bytecode, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 20 });
  assert.equal(receipt.status, "success");
  return receipt.contractAddress;
};
const mustRevert = async (fn) => {
  let rejected = false;
  try {
    await fn();
  } catch (error) {
    assert.match(String(error), /revert/i);
    rejected = true;
  }
  assert(rejected, "substitution was accepted");
};
try {
  for (let i = 0; ; i++) {
    try {
      assert.equal(await publicClient.getChainId(), 1337);
      break;
    } catch (error) {
      if (i === 100) throw error;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const verifier = await deploy(compiled.abi, "0x" + compiled.bin);
  assert.equal(
    keccak256(await publicClient.getBytecode({ address: verifier })),
    compiledReceipt.runtimeKeccak256,
  );
  const consumerAddress = await deploy(consumer.abi, consumer.bytecode.object, [verifier]);
  const verify = (bytes, values) =>
    publicClient.readContract({
      address: verifier,
      abi: compiled.abi,
      functionName: "verifyProof",
      args: [bytes, values],
    });
  const check = (statement, bytes, values) =>
    publicClient.readContract({
      address: consumerAddress,
      abi: consumer.abi,
      functionName: "check",
      args: [statement, bytes, values],
    });
  await verify(proof.proof, x);
  assert.equal(await check(proof.statement, proof.proof, x), true);
  const wrongInput = [x[0], x[1] ^ 1n];
  await mustRevert(() => verify(proof.proof, wrongInput));
  const last = Number.parseInt(proof.proof.slice(-2), 16) ^ 1;
  const wrongProof = proof.proof.slice(0, -2) + last.toString(16).padStart(2, "0");
  await mustRevert(() => check(proof.statement, wrongProof, x));
  await mustRevert(() => check(proof.statement, proof.proof, wrongInput));
  assert.equal(await check(proof.statement, proof.proof, x), true);
  const gas = await publicClient.estimateContractGas({
    address: consumerAddress,
    abi: consumer.abi,
    functionName: "check",
    args: [proof.statement, proof.proof, x],
    account: wallet.account.address,
  });
  const report = {
    scope:
      "New MPC invalid-point keys: actual native producer proof, Solidity verifier and consumer on fresh private Anvil; not full Game/H3 replay",
    chainId: 1337,
    setupManifestSha256: proof.setupManifestSha256,
    proofSha256: createHash("sha256")
      .update(readFileSync(join(root, "proof.json")))
      .digest("hex"),
    verifier,
    consumer: consumerAddress,
    runtimeKeccak256: compiledReceipt.runtimeKeccak256,
    verifierAccepted: true,
    consumerAccepted: true,
    substitutedPublicInputRejected: true,
    substitutedProofRejected: true,
    consumerStatementMismatchRejected: true,
    positiveRechecked: true,
    estimatedCheckGas: String(gas),
    productionApproved: false,
    realNetworkDeployment: false,
  };
  writeFileSync(join(root, "evm-report.json"), JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
  });
  console.log(JSON.stringify(report));
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((r) => child.once("exit", r));
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
    await exited;
    clearTimeout(timer);
  }
}

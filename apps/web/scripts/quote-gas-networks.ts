// Reprice an existing local benchmark across networks. All RPC calls are read-only.
// pnpm --filter @vendetta/web exec tsx scripts/quote-gas-networks.ts [input.json] [output.json]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  http,
  parseAbi,
  serializeTransaction,
  type Chain,
  type Hex,
} from "viem";
import { arbitrum, base, gnosis, optimism, polygon } from "viem/chains";

const input =
  process.argv[2] ??
  fileURLToPath(new URL("../../../docs/benchmarks/gas-2026-10-23.json", import.meta.url));
const output = process.argv[3] ?? "/tmp/vendetta-gas-networks.json";
type Row = {
  name: string;
  mode: string;
  chargedGas: string;
  gasUsed: string;
  to: Hex;
  data: Hex;
  userOperationLimits?: {
    callGasLimit: string;
    verificationGasLimit: string;
    preVerificationGas: string;
  };
};
const source = JSON.parse(readFileSync(input, "utf8")) as {
  complete: boolean;
  measuredAt: string;
  revision: string;
  rows: Row[];
  costs: { name: string; measuredServiceUsd: number }[];
};
if (!source.complete) throw new Error("Input must be a complete local benchmark");
const response = await fetch(
  "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,polygon-ecosystem-token&vs_currencies=usd",
);
if (!response.ok) throw new Error(`Token price request failed: ${response.status}`);
const prices = (await response.json()) as Record<string, { usd: number }>;
const oracle = "0x420000000000000000000000000000000000000F";
const l1Block = "0x4200000000000000000000000000000000000015";
const oracleAbi = parseAbi([
  "function getL1Fee(bytes data) view returns (uint256)",
  "function isJovian() view returns (bool)",
]);
const operatorAbi = parseAbi([
  "function operatorFeeScalar() view returns (uint32)",
  "function operatorFeeConstant() view returns (uint64)",
]);
const arbAbi = parseAbi([
  "function gasEstimateL1Component(address to,bool contractCreation,bytes data) external payable returns (uint64 gasEstimateForL1,uint256 baseFee,uint256 l1BaseFeeEstimate)",
]);
async function quote(chain: Chain, url: string, kind: "op" | "arb" | "l1", token: string) {
  const client = createPublicClient({ chain, transport: http(url), cacheTime: 0 });
  const [block, rpcGasPrice] = await Promise.all([client.getBlock(), client.getGasPrice()]);
  // Retain the same conservative Gnosis budget used in the original comparison.
  const gasPrice = chain.id === 100 ? 1_500_000_000n : rpcGasPrice;
  const nativeUsd = chain.id === 100 ? 1 : prices[token]!.usd;
  if (!(nativeUsd > 0)) throw new Error(`Missing USD price for ${chain.name}`);
  let scalar = 0n,
    constant = 0n,
    jovian = false;
  if (kind === "op") {
    const values = await Promise.all([
      client.readContract({
        address: l1Block,
        abi: operatorAbi,
        functionName: "operatorFeeScalar",
        blockNumber: block.number,
      }),
      client.readContract({
        address: l1Block,
        abi: operatorAbi,
        functionName: "operatorFeeConstant",
        blockNumber: block.number,
      }),
      client
        .readContract({
          address: oracle,
          abi: oracleAbi,
          functionName: "isJovian",
          blockNumber: block.number,
        })
        .catch(() => false),
    ]);
    scalar = BigInt(values[0]);
    constant = values[1];
    jovian = values[2];
  }
  const rows: {
    name: string;
    executionWei: bigint;
    dataWei: bigint;
    operatorWei: bigint;
    networkUsd: number;
    serviceUsd: number;
    totalUsd: number;
  }[] = [];
  for (const row of source.rows) {
    const gas = BigInt(row.chargedGas);
    let dataFee = 0n,
      operatorFee = 0n;
    if (kind === "arb") {
      const { result } = await client.simulateContract({
        address: "0x00000000000000000000000000000000000000c8",
        abi: arbAbi,
        functionName: "gasEstimateL1Component",
        args: [row.to, false, row.data],
        blockNumber: block.number,
      });
      dataFee = result[0] * result[1];
    } else if (kind === "op") {
      const limits = row.userOperationLimits;
      const envelopeGas = limits
        ? BigInt(limits.callGasLimit) +
          BigInt(limits.verificationGasLimit) +
          BigInt(limits.preVerificationGas) +
          150_000n
        : BigInt(row.gasUsed) * 2n;
      const unsigned = serializeTransaction({
        type: "eip1559",
        chainId: chain.id,
        to: row.to,
        data: row.data,
        nonce: 1,
        gas: envelopeGas,
        maxFeePerGas: gasPrice * 2n,
        maxPriorityFeePerGas:
          gasPrice > block.baseFeePerGas! ? gasPrice - block.baseFeePerGas! : 0n,
      });
      dataFee = await client.readContract({
        address: oracle,
        abi: oracleAbi,
        functionName: "getL1Fee",
        args: [unsigned],
        blockNumber: block.number,
      });
      const actualGas = BigInt(row.gasUsed);
      operatorFee =
        constant + (jovian ? actualGas * scalar * 100n : (actualGas * scalar) / 1_000_000n);
    }
    const executionFee = gas * gasPrice;
    const networkUsd = (Number(executionFee + dataFee + operatorFee) / 1e18) * nativeUsd;
    const serviceUsd = source.costs.find((c) => c.name === row.name)!.measuredServiceUsd;
    rows.push({
      name: row.name,
      executionWei: executionFee,
      dataWei: dataFee,
      operatorWei: operatorFee,
      networkUsd,
      serviceUsd,
      totalUsd: row.mode === "sponsored" ? networkUsd * 1.1 + serviceUsd : networkUsd,
    });
  }
  const scenarios: Record<string, string[]> = {
    onboardingAndFirstBuild: [
      "create_account_passkey_publish_register_invite",
      "first_action_deploy_session_accept_build",
    ],
    simpleBuild: ["queue_build_waiting"],
    hiddenMissionFullCycle: [
      "send_hidden_attack_tlock",
      "keeper_reveal_arrived_hidden_attack",
      "keeper_resolve_revealed_attack",
      "keeper_return_hidden_attack",
    ],
    keeperHeavyBattle: ["keeper_resolve_heavy_16v21_stacks_5_rounds"],
  };
  const totals = Object.fromEntries(
    Object.entries(scenarios).map(([name, names]) => [
      name,
      {
        networkUsd: rows
          .filter((r) => names.includes(r.name))
          .reduce((s, r) => s + r.networkUsd, 0),
        totalUsd: rows.filter((r) => names.includes(r.name)).reduce((s, r) => s + r.totalUsd, 0),
      },
    ]),
  );
  console.log(chain.name, JSON.stringify(totals));
  return {
    chain: chain.name,
    chainId: chain.id,
    rpc: url,
    block: block.number,
    timestamp: block.timestamp,
    rpcGasPriceWei: rpcGasPrice,
    budgetGasPriceWei: gasPrice,
    nativeUsd,
    operatorScalar: scalar,
    operatorConstant: constant,
    isJovian: jovian,
    rows,
    scenarios: totals,
  };
}
const settled = await Promise.allSettled([
  quote(arbitrum, "https://arb1.arbitrum.io/rpc", "arb", "ethereum"),
  quote(optimism, "https://mainnet.optimism.io", "op", "ethereum"),
  quote(base, "https://mainnet.base.org", "op", "ethereum"),
  quote(gnosis, "https://rpc.gnosischain.com", "l1", "xdai"),
  quote(polygon, "https://polygon-bor-rpc.publicnode.com", "l1", "polygon-ecosystem-token"),
]);
const networks = [];
for (const result of settled) {
  if (result.status === "fulfilled") networks.push(result.value);
  else throw result.reason;
}
writeFileSync(
  output,
  JSON.stringify(
    {
      quotedAt: new Date().toISOString(),
      benchmarkMeasuredAt: source.measuredAt,
      revision: source.revision,
      methodology:
        "Reuses local charged gas and transaction calldata. Execution gas is projected unchanged on each chain. OP Stack data fees are read from GasPriceOracle.getL1Fee using an estimated unsigned EIP-1559 envelope; operator fees use L1Block scalars and the active Jovian formula. Arbitrum data fees use NodeInterface. No transactions submitted. Includes the previous local API-call service cost and 10% gas surcharge for sponsored rows; excludes monthly included credits. This is a point-in-time projection, not a mainnet benchmark or proof of account/provider compatibility.",
      priceSource: response.url,
      prices,
      sources: [
        "https://docs.optimism.io/op-stack/transactions/fees",
        "https://docs.base.org/specifications/transactions/network-fees",
        "https://docs.pimlico.io/guides/pricing",
      ],
      networks,
    },
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ) + "\n",
);
console.log(`Saved ${output}`);

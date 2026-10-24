// Snapshots, from Gnosis Chain, the ERC-4337 contracts the passkey accounts use, so the local stack
// (aa-stack.ts) can install them on a plain anvil at the same addresses: no fork, no network.
// Output: scripts/aa-contracts.json (committed). Re-run only to pick up new contract versions.
//
//   tsx scripts/aa-fixture.ts   (GNOSIS_RPC_URL overrides the public RPC)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  encodeAbiParameters,
  http,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { gnosis } from "viem/chains";

const client = createPublicClient({
  chain: gnosis,
  transport: http(process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com"),
});
if ((await client.getChainId()) !== gnosis.id) throw new Error("Expected Gnosis Chain (100)");

const KERNEL_FACTORY: Address = "0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419"; // Kernel v3.1
const META_FACTORY: Address = "0xd703aaE79538628d27099B8c4f621bE4CCd142d5";
const SIMPLE_FACTORY: Address = "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985"; // SimpleAccount, EP 0.7

const contracts: [string, Address][] = [
  ["EntryPoint 0.7", "0x0000000071727De22E5E9d8BAf0edAc6f37da032"],
  ["EntryPoint 0.7 SenderCreator", "0xEFC2c1444eBCC4Db75e7613d20C6a62fF67A167C"],
  ["Kernel v3.1 implementation", "0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D"],
  ["Kernel v3.1 factory", KERNEL_FACTORY],
  ["Kernel meta factory", META_FACTORY],
  ["Kernel WebAuthn validator", "0x7ab16Ff354AcB328452F1D445b3Ddee9a91e9e69"],
  ["P-256 verifier (Daimo)", "0xc2b78104907F722DABAc4C69f826a522B2754De4"],
  ["SimpleAccount factory", SIMPLE_FACTORY],
  // Not used by the game: Pimlico's mock paymaster funds its paymasters on every EntryPoint.
  ["EntryPoint 0.6", "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"],
  ["EntryPoint 0.8", "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108"],
];
const simpleImpl = await client.readContract({
  address: SIMPLE_FACTORY,
  abi: [
    {
      type: "function",
      name: "accountImplementation",
      inputs: [],
      outputs: [{ type: "address" }],
      stateMutability: "view",
    },
  ],
  functionName: "accountImplementation",
});
contracts.push(["SimpleAccount implementation", simpleImpl]);

// The meta factory deploys only through approved factories: approved[KERNEL_FACTORY] (slot 0).
const approvedSlot = keccak256(
  encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [KERNEL_FACTORY, 0n]),
);
const storage: Record<Address, Record<Hex, Hex>> = {
  [META_FACTORY]: {
    [approvedSlot]: (await client.getStorageAt({ address: META_FACTORY, slot: approvedSlot }))!,
  },
};

const block = await client.getBlockNumber();
const out = {
  source: `Gnosis Chain, block ${block}`,
  contracts: await Promise.all(
    contracts.map(async ([name, address]) => {
      const code = await client.getCode({ address, blockNumber: block });
      if (!code || code === "0x") throw new Error(`${name} has no code at ${address}`);
      return { name, address, code, storage: storage[address] ?? {} };
    }),
  ),
};
const dest = join(dirname(fileURLToPath(import.meta.url)), "aa-contracts.json");
writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log(`${dest}: ${out.contracts.length} contracts from ${out.source}`);

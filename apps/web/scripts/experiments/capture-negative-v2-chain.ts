// Read-only public transaction/H3 capture for the live acceptance chain.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createPublicClient, http, parseAbi, decodeAbiParameters, toHex, type Address } from "viem";
const [out] = process.argv.slice(2);
if (!out?.startsWith("/")) throw new Error("Absolute evidence directory required");
const stack = JSON.parse(readFileSync(join(out, "session/stack.json"), "utf8"));
const consumers = JSON.parse(readFileSync(join(out, "session/consumers.json"), "utf8"));
const pub = createPublicClient({
  transport: http(stack.deployment.rpc, { retryCount: 0, timeout: 5000 }),
  cacheTime: 0,
});
const getter = parseAbi([
  "function prefix() view returns(address)",
  "function receiptForContext(bytes32) view returns(bytes32)",
  "function states(bytes32) view returns(bytes32 pre,uint256 scalar,uint32 next,uint32 acceptedAt,uint8 status)",
]);
const prefix = await pub.readContract({
  address: consumers.opening,
  abi: getter,
  functionName: "prefix",
});
const targets = new Set(
  [stack.deployment.game, consumers.opening, consumers.point, prefix].map((address) =>
    address.toLowerCase(),
  ),
);
const serialize = (v: unknown) =>
  JSON.stringify(v, (_, n) => (typeof n === "bigint" ? n.toString() : n), 2) + "\n";
let next = BigInt(stack.deployment.fromBlock);
const transactions: unknown[] = [];
const h3: Record<string, unknown> = {};
try {
  while (!existsSync(join(out, "session/closed.json"))) {
    const head = await pub.getBlockNumber({ cacheTime: 0 });
    const batch: bigint[] = [];
    for (let number = next; number <= head; number++) batch.push(number);
    for (let offset = 0; offset < batch.length; offset += 32) {
      const blocks = await Promise.all(
        batch
          .slice(offset, offset + 32)
          .map((blockNumber) => pub.getBlock({ blockNumber, includeTransactions: true })),
      );
      for (const block of blocks)
        for (const tx of block.transactions) {
          if (typeof tx === "string" || !tx.to || !targets.has(tx.to.toLowerCase())) continue;
          const receipt = await pub.getTransactionReceipt({ hash: tx.hash });
          transactions.push({
            block: block.number,
            timestamp: block.timestamp,
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            input: tx.input,
            nonce: tx.nonce,
            receipt,
          });
        }
    }
    next = head + 1n;
    for (const file of readdirSync(out).filter((file) => file.endsWith("-certificate.json"))) {
      if (h3[file]) continue;
      const certificate = JSON.parse(readFileSync(join(out, file), "utf8"));
      if (certificate.kind !== 1) continue;
      const [inputs] = decodeAbiParameters([{ type: "uint256[55]" }], certificate.encodedInputs);
      const pre = toHex((inputs[51] << 128n) | inputs[52], { size: 32 });
      const receipt = await pub.readContract({
        address: prefix as Address,
        abi: getter,
        functionName: "receiptForContext",
        args: [pre],
      });
      const state = await pub.readContract({
        address: prefix as Address,
        abi: getter,
        functionName: "states",
        args: [receipt],
      });
      h3[file] = {
        prefix,
        pre,
        receipt,
        state,
        publicScalar: (inputs[53] << 128n) | inputs[54],
        observedBlock: head,
      };
    }
    writeFileSync(
      join(out, "chain-public-transactions.json"),
      serialize({ throughBlock: head, targets: [...targets], transactions }),
    );
    writeFileSync(join(out, "h3-public-states.json"), serialize(h3));
    await delay(5000);
  }
} catch (error) {
  if (!existsSync(join(out, "session/closed.json"))) throw error;
}

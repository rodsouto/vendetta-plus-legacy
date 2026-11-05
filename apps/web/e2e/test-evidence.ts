// Explicit trusted-consumer fixture for browser tests. Never imported by the app or keeper.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeAbiParameters,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { decodeHiddenPlain, sim } from "@vendetta/rules";
import { DEV_KEYS } from "../src/chain/config.js";
import { gameAbi } from "../src/chain/abi.js";
import { encodePlain } from "../src/chain/codec.js";
import { decodeHiddenEvidence } from "../src/chain/hidden-evidence.js";

export async function certifyTestMissions(page: Page) {
  const stores = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith("hidden:"))
      .map((key) => ({ key, value: localStorage.getItem(key)! })),
  );
  assert(stores.length > 0, "No browser plaintext drafts for test fixture");
  const game = stores[0]!.key.split(":")[1] as Address;
  assert(/^0x[0-9a-f]{40}$/.test(game));
  const transport = http("http://127.0.0.1:8555", { retryCount: 0, timeout: 15000 });
  const client = createPublicClient({ transport, cacheTime: 0 });
  assert.equal(await client.getChainId(), 31337, "Test fixture chain only");
  const consumers = await client.readContract({
    address: game,
    abi: gameAbi,
    functionName: "hiddenConsumers",
  });
  const mock = JSON.parse(
    readFileSync(
      new URL("../../../contracts/out/HiddenConsumer.sol/HiddenConsumerMock.json", import.meta.url),
      "utf8",
    ),
  );
  // Refuse to submit trusted fixture evidence to a real consumer, even on Anvil.
  for (const address of consumers)
    assert.equal(await client.getBytecode({ address }), mock.deployedBytecode.object);
  const plains = new Map<string, string>();
  for (const store of stores) {
    assert.equal(store.key.split(":")[1], game);
    for (const [commit, plain] of Object.entries(JSON.parse(store.value) as Record<string, string>))
      plains.set(commit, plain);
  }
  const wallet = createWalletClient({ transport, account: privateKeyToAccount(DEV_KEYS[0]) });
  const pending = await client.readContract({
    address: game,
    abi: gameAbi,
    functionName: "pendingMissions",
  });
  let count = 0;
  for (const id of pending) {
    const m = await client.readContract({
      address: game,
      abi: gameAbi,
      functionName: "getMission",
      args: [id],
    });
    if (!m.hidden || m.returning) continue;
    const e = decodeHiddenEvidence(
      await client.readContract({
        address: game,
        abi: gameAbi,
        functionName: "getHiddenEvidence",
        args: [id],
      }),
    );
    assert(e);
    if (e.receipt.status !== 1) continue;
    const stored = plains.get(m.commit.toLowerCase());
    assert(stored, `Missing test plaintext for mission ${id}`);
    const plain = decodeHiddenPlain(stored);
    assert(plain);
    assert.equal(sim.hiddenCommit(m.owner, plain.kind, plain.target, plain.salt), m.commit);
    const inputs = Array<bigint>(55).fill(0n);
    inputs[48] = BigInt(e.receipt.statement) >> 128n;
    inputs[49] = BigInt(e.receipt.statement) & ((1n << 128n) - 1n);
    const certificate: Hex = encodeAbiParameters(
      [{ type: "uint8" }, { type: "bytes" }, { type: "bytes" }],
      [
        1,
        encodeAbiParameters(
          [{ type: "bool" }, { type: "bytes" }],
          [true, toHex(encodePlain(plain))],
        ),
        encodeAbiParameters([{ type: "uint256[55]" }], [inputs as never]),
      ],
    );
    const hash = await wallet.writeContract({
      chain: null,
      address: game,
      abi: gameAbi,
      functionName: "submitHiddenEvidence",
      args: [id, certificate],
      gas: 12000000n,
    });
    assert.equal(
      (await client.waitForTransactionReceipt({ hash, pollingInterval: 20, timeout: 15000 }))
        .status,
      "success",
    );
    count++;
  }
  assert(count > 0, "No pending hidden evidence certified by fixture");
  await page.reload();
  return count;
}

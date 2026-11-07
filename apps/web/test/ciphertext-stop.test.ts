import { expect, it, vi } from "vitest";
import type { PublicClient, Address } from "viem";
import { CiphertextIndex } from "../src/chain/hidden.js";

it("stops a large historical scan after the current read without issuing the next query", async () => {
  const abort = new AbortController();
  const reason = new Error("operator stop");
  const client = {
    getBlockNumber: vi.fn(async () => 1000000n),
    getBlock: vi.fn(async () => {
      abort.abort(reason);
      return { hash: "0x11" };
    }),
    getContractEvents: vi.fn(),
  };
  const index = new CiphertextIndex(
    client as unknown as PublicClient,
    "0x1111111111111111111111111111111111111111" as Address,
    0,
    abort.signal,
  );
  await expect(index.catchUp()).rejects.toBe(reason);
  expect(client.getBlock).toHaveBeenCalledTimes(1);
  expect(client.getContractEvents).not.toHaveBeenCalled();
  await expect(index.catchUp()).rejects.toBe(reason);
  expect(client.getBlockNumber).toHaveBeenCalledTimes(1);
});

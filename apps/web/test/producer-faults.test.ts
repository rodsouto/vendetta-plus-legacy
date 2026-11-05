import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, it } from "vitest";
import { producerFaults } from "../scripts/experiments/producer-faults.js";
import { fetchBeacon } from "../scripts/prover/beacon.js";

it("injects observable faults only on loopback and forwards an ambiguous H3 send before dropping its response", async () => {
  await expect(producerFaults("https://example.com", new Map())).rejects.toThrow("loopback");
  let forwarded = 0;
  const upstream = createServer(async (req, res) => {
    for await (const _chunk of req) {
      /* consume the RPC body */
    }
    forwarded++;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x01" }));
  });
  await new Promise<void>((done) => upstream.listen(0, "127.0.0.1", done));
  const proxy = await producerFaults(
    `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
    new Map([["1001", "ab".repeat(48)]]),
  );
  const rpc = (method: string) =>
    fetch(proxy.rpc, {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
    });
  try {
    proxy.setMode("rpc");
    expect((await rpc("eth_chainId")).status).toBe(503);
    expect(forwarded).toBe(0);
    proxy.setMode("beacon");
    await expect(fetchBeacon(1001n, { baseUrl: proxy.beacon })).rejects.toThrow("unavailable");
    expect((await rpc("eth_chainId")).status).toBe(200);
    proxy.setMode("h3");
    await expect(rpc("eth_sendRawTransaction")).rejects.toThrow();
    expect(forwarded).toBe(2);
    expect((await rpc("eth_getTransactionReceipt")).status).toBe(503);
    expect(forwarded).toBe(2);
    proxy.setMode("healthy");
    expect(await fetchBeacon(1001n, { baseUrl: proxy.beacon })).toBe("ab".repeat(48));
    expect((await rpc("eth_getTransactionReceipt")).status).toBe(200);
    expect(proxy.stats()).toEqual({
      rpcRejected: 1,
      beaconRejected: 1,
      lostBroadcastReplies: 1,
      receiptsRejected: 1,
    });
  } finally {
    await proxy.close();
    upstream.closeAllConnections();
    await new Promise<void>((done) => upstream.close(() => done()));
  }
});

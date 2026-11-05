// Loopback-only fault transport for the real producer soak. Never used by the service CLI.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export async function producerFaults(upstream: string, signatures: ReadonlyMap<string, string>) {
  const target = new URL(upstream);
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1")
    throw new Error("Fault proxy requires private loopback RPC");
  let mode: "healthy" | "rpc" | "beacon" | "h3" = "healthy";
  const counts = {
    rpcRejected: 0,
    beaconRejected: 0,
    lostBroadcastReplies: 0,
    receiptsRejected: 0,
  };
  const server = createServer(async (req, res) => {
    try {
      if (req.url?.startsWith("/beacon/public/")) {
        if (mode === "beacon") {
          counts.beaconRejected++;
          res.writeHead(503).end();
          return;
        }
        const round = req.url.slice("/beacon/public/".length);
        const signature = signatures.get(round);
        if (!signature) {
          res.writeHead(404).end();
          return;
        }
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ round: Number(round), signature }));
        return;
      }
      if (req.method !== "POST" || req.url !== "/") {
        res.writeHead(404).end();
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1048576) throw new Error("Fault proxy request too large");
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks).toString();
      const rpc = JSON.parse(body) as { method: string };
      if (mode === "rpc" || (mode === "h3" && rpc.method === "eth_getTransactionReceipt")) {
        if (mode === "rpc") counts.rpcRejected++;
        else counts.receiptsRejected++;
        res.writeHead(503).end();
        return;
      }
      const response = await fetch(upstream, {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      const reply = await response.text();
      // Deliver to the chain first, then lose the response. Receipt unavailability
      // leaves the journal unresolved even though the transaction was mined.
      if (mode === "h3" && rpc.method === "eth_sendRawTransaction") {
        counts.lostBroadcastReplies++;
        res.destroy();
        return;
      }
      res.writeHead(response.status, { "content-type": "application/json" }).end(reply);
    } catch {
      res.destroy();
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    rpc: url,
    beacon: url + "/beacon",
    setMode(value: typeof mode) {
      mode = value;
    },
    stats: () => ({ ...counts }),
    async close() {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}

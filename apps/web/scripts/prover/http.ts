import type { producerAccess } from "./access.js";
import { createServer, type IncomingMessage } from "node:http";

async function readBody(req: IncomingMessage, timeoutMs: number) {
  // An absolute upload deadline also catches clients that trickle bytes often
  // enough to avoid an inactivity timeout. It ends before proof generation.
  const timer = setTimeout(() => req.destroy(), timeoutMs);
  timer.unref();
  try {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 16384) throw new Error("Request too large");
      chunks.push(chunk);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error("Request must be an object");
    return body as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

export function producerServer(
  generate: (body: Record<string, unknown>) => Promise<string>,
  {
    bodyTimeoutMs = 10000,
    maxConnections = 32,
    metrics,
    access,
  }: {
    bodyTimeoutMs?: number;
    maxConnections?: number;
    metrics?: () => unknown;
    access?: ReturnType<typeof producerAccess>;
  } = {},
) {
  for (const value of [bodyTimeoutMs, maxConnections])
    if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647)
      throw new Error("Invalid producer HTTP limit");
  let active = 0;
  const server = createServer(
    {
      maxHeaderSize: 8192,
      headersTimeout: 10000,
      requestTimeout: 15000,
      connectionsCheckingInterval: 1000,
      keepAliveTimeout: 5000,
    },
    (req, res) => {
      // Close each connection after one response to bound pipelined waiters.
      res.setHeader("Connection", "close");
      const isMetrics = req.method === "GET" && req.url === "/metrics" && !!metrics;
      if (!isMetrics && (req.method !== "POST" || req.url !== "/")) {
        res.writeHead(404).end();
        return;
      }
      const admission = access?.acquire(req.headers.authorization, isMetrics ? "metrics" : "prove");
      if (admission && admission.status !== 200) {
        if (admission.status === 401) res.setHeader("WWW-Authenticate", "Bearer");
        if (admission.status === 429) res.setHeader("Retry-After", String(admission.retryAfter));
        res.writeHead(admission.status).end();
        return;
      }
      const release = admission?.release ?? (() => {});
      if (isMetrics) {
        try {
          res.writeHead(200, { "Content-Type": "application/json" }).end(
            JSON.stringify({
              activeHandlers: active,
              access: access?.stats(),
              ...(metrics!() as object),
            }),
          );
        } finally {
          release();
        }
        return;
      }
      if (active >= maxConnections) {
        release();
        res.writeHead(503).end();
        return;
      }
      active++;
      void (async () => {
        try {
          const body = await readBody(req, bodyTimeoutMs);
          const certificate = await generate(body);
          if (res.destroyed || res.writableEnded) return;
          res
            .writeHead(200, { "Content-Type": "application/json" })
            .end(JSON.stringify({ certificate }));
        } catch (err) {
          console.warn("certificate request will retry:", (err as Error).message);
          if (res.destroyed || res.writableEnded) return;
          res
            .writeHead(503, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "Certificate unavailable; retry later" }));
        } finally {
          active--;
          release();
        }
      })();
    },
  );
  server.maxConnections = maxConnections;
  server.maxRequestsPerSocket = 1;
  return server;
}

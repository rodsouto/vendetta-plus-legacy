import { createServer } from "node:http";
import { expect, it } from "vitest";
import { fetchBeacon } from "../scripts/prover/beacon.js";
import { serialQueue } from "../scripts/prover/jobs.js";

it("bounds failed, oversized and stalled beacon responses and recovers queued work", async () => {
  let mode = "unavailable";
  const signature = "ab".repeat(48);
  const server = createServer((req, res) => {
    expect(req.url).toBe("/public/1001");
    if (mode === "unavailable") {
      res.writeHead(503).end();
      return;
    }
    if (mode === "oversized") {
      res.end(" ".repeat(4097));
      return;
    }
    if (mode === "stalled") {
      res.writeHead(200);
      res.write('{"round":');
      return;
    }
    res.end(JSON.stringify({ round: mode === "wrong-round" ? 1000 : 1001, signature }));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const listener = server.address();
    if (!listener || typeof listener === "string") throw new Error("Missing beacon listener");
    const options = { baseUrl: `http://127.0.0.1:${listener.port}`, timeoutMs: 200 };
    const queue = serialQueue<string>(8);
    for (const failure of ["unavailable", "oversized", "stalled", "wrong-round"]) {
      mode = failure;
      const results = await Promise.allSettled(
        Array.from({ length: 4 }, (_, i) =>
          queue(`${failure}-${i}`, () => fetchBeacon(1001n, options)),
        ),
      );
      expect(results.every((result) => result.status === "rejected")).toBe(true);
      expect(queue.stats().pending).toBe(0);
      mode = "healthy";
      expect(await queue("recover", () => fetchBeacon(1001n, options))).toBe(signature);
    }
    await queue.drain();
    expect(queue.stats().pending).toBe(0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

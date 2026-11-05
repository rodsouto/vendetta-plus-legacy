// Benchmark-only transport: Node fetch's own header deadline can expire while
// a real proof waits behind other jobs. Keep a single, explicit total deadline.
import { request } from "node:http";

export function benchmarkFetch(timeoutMs: number, token: string): typeof fetch {
  return async (input, init) => {
    if (typeof input !== "string") throw new Error("Benchmark requires a loopback URL");
    const url = new URL(input);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password)
      throw new Error("Benchmark requires a loopback URL");
    return new Promise<Response>((resolve, reject) => {
      const req = request(
        url,
        {
          method: init?.method,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(timeoutMs),
          agent: false,
        },
        (res) => {
          let size = 0;
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > 65536) {
              res.destroy(new Error("Benchmark response too large"));
              return;
            }
            chunks.push(chunk);
          });
          res.on("error", reject);
          res.on("end", () =>
            resolve(new Response(Buffer.concat(chunks), { status: res.statusCode })),
          );
        },
      );
      req.on("error", reject);
      req.end(init?.body);
    });
  };
}

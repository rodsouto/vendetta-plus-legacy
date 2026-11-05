import { once } from "node:events";
import { connect } from "node:net";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { producerServer } from "../scripts/prover/http.js";

const servers: ReturnType<typeof producerServer>[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map((s) => {
      s.closeAllConnections();
      return new Promise<void>((resolve) => s.close(() => resolve()));
    }),
  );
});
async function start(generate: Parameters<typeof producerServer>[0], options = {}) {
  const server = producerServer(generate, options);
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return (server.address() as AddressInfo).port;
}
function post(port: number, body: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port, method: "POST", path: "/", agent: false },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode!, body }));
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}
describe("producer HTTP resource limits", () => {
  it("bounds waiters after clients disconnect and recovers when the job finishes", async () => {
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    const port = await start(
      async () => {
        started();
        await gate;
        return "0x";
      },
      { maxConnections: 1 },
    );
    const socket = connect(port, "127.0.0.1");
    await once(socket, "connect");
    socket.write("POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: 2\r\n\r\n{}");
    await running;
    // The live connection fills the socket budget.
    const excess = connect(port, "127.0.0.1");
    await once(excess, "close");
    const closed = once(socket, "close");
    socket.destroy();
    await closed;
    // Wait for the server to observe the disconnect; the handler budget still
    // holds the running proof, even though its socket is gone.
    let response: Awaited<ReturnType<typeof post>> | undefined;
    for (let attempt = 0; attempt < 20 && !response; attempt++) {
      response = await post(port, "{}").catch(() => undefined);
      if (!response) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(response?.status).toBe(503);
    release();
    await new Promise((resolve) => setImmediate(resolve));
    expect((await post(port, "{}")).status).toBe(200);
  });
  it("rejects malformed roots and oversized uploads before generating, then recovers", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const generate = vi.fn(async () => "0x1234");
    const port = await start(generate);
    for (const body of ["null", "[]", "1", "{", JSON.stringify({ packet: "x".repeat(17000) })]) {
      // A streaming overflow may destroy the socket rather than return JSON.
      const response = await post(port, body).catch(() => null);
      if (response) expect(response.status).toBe(503);
    }
    expect(generate).not.toHaveBeenCalled();
    expect(await post(port, "{}")).toEqual({ status: 200, body: '{"certificate":"0x1234"}' });
  });
  it("closes an unfinished upload and frees its only connection slot", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const generate = vi.fn(async () => "0x");
    const port = await start(generate, { bodyTimeoutMs: 100, maxConnections: 1 });
    const socket = connect(port, "127.0.0.1");
    await once(socket, "connect");
    const closed = once(socket, "close");
    socket.write("POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: 100\r\n\r\n{");
    await closed;
    expect(generate).not.toHaveBeenCalled();
    expect((await post(port, "{}")).status).toBe(200);
  });
  it("does not apply the upload deadline to proof generation", async () => {
    const port = await start(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return "0x";
      },
      { bodyTimeoutMs: 30 },
    );
    expect((await post(port, "{}")).status).toBe(200);
  });
});

it("exposes aggregate metrics without starting a certificate job", async () => {
  const generate = vi.fn(async () => "0x");
  const port = await start(generate, { metrics: () => ({ queue: { pending: 2 } }) });
  const response = await fetch(`http://127.0.0.1:${port}/metrics`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ activeHandlers: 0, queue: { pending: 2 } });
  expect(generate).not.toHaveBeenCalled();
});

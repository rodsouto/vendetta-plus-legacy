import { once } from "node:events";
import { connect, type AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import { producerAccess } from "../scripts/prover/access.js";
import { producerServer } from "../scripts/prover/http.js";
import { requestCertificate } from "../src/chain/certificates.js";
const token = "test-prover-" + "a".repeat(32);
const observer = "test-observer-" + "b".repeat(32);
const client = { token, scopes: ["prove"], requestsPerMinute: 60, maxConcurrent: 1 };
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
async function start(
  generate: Parameters<typeof producerServer>[0],
  access: ReturnType<typeof producerAccess>,
) {
  const server = producerServer(generate, { access, metrics: () => ({}) });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  return { port, url: `http://127.0.0.1:${port}/` };
}
it.each([
  undefined,
  [],
  [client, client],
  [{ ...client, token: "short" }],
  [{ ...client, scopes: ["admin"] }],
  [{ ...client, scopes: [] }],
  [{ ...client, requestsPerMinute: 0 }],
  [{ ...client, maxConcurrent: 33 }],
  [{ ...client, requestsPerMinute: 1.5 }],
  [{ ...client, maxConcurrent: NaN }],
])("rejects invalid client configuration %#", (input) => {
  expect(() => producerAccess(input)).toThrow("Invalid producer clients configuration");
});
it("refills per-client quotas independently and holds concurrent slots until released", () => {
  let time = 0;
  const access = producerAccess(
    [
      { ...client, requestsPerMinute: 1 },
      { ...client, token: observer },
    ],
    () => time,
  );
  const first = access.acquire(`Bearer ${token}`, "prove");
  expect(first.status).toBe(200);
  time = 60000;
  expect(access.acquire(`Bearer ${token}`, "prove").status).toBe(429);
  const other = access.acquire(`Bearer ${observer}`, "prove");
  expect(other.status).toBe(200);
  if (first.status === 200) {
    first.release();
    first.release();
  }
  const next = access.acquire(`Bearer ${token}`, "prove");
  expect(next.status).toBe(200);
  if (next.status === 200) next.release();
  expect(access.acquire(`Bearer ${token}`, "prove").status).toBe(429);
  time += 60000;
  expect(access.acquire(`Bearer ${token}`, "prove").status).toBe(200);
});
it("authenticates before upload, separates scopes and keeps metrics aggregate", async () => {
  const access = producerAccess([client, { ...client, token: observer, scopes: ["metrics"] }]);
  const generate = vi.fn(async () => "0xabcd");
  const { url, port } = await start(generate, access);
  for (const headers of [{}, { Authorization: "Bearer wrong" }])
    expect((await fetch(url, { method: "POST", headers, body: "{" })).status).toBe(401);
  expect((await fetch(url + "metrics")).status).toBe(401);
  expect(
    (await fetch(url + "metrics", { headers: { Authorization: `Bearer ${token}` } })).status,
  ).toBe(403);
  expect(
    (
      await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${observer}` },
        body: "{}",
      })
    ).status,
  ).toBe(403);
  expect(generate).not.toHaveBeenCalled();
  // An unauthorized client never needs to finish sending its body.
  const socket = connect(port, "127.0.0.1");
  await once(socket, "connect");
  let response = "";
  socket.on("data", (chunk) => {
    response += chunk;
  });
  const closed = once(socket, "close");
  socket.write("POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: 100\r\n\r\n{");
  await closed;
  expect(response).toContain("401");
  expect(await requestCertificate(url, {}, fetch, token)).toBe("0xabcd");
  const metrics = await (
    await fetch(url + "metrics", { headers: { Authorization: `Bearer ${observer}` } })
  ).json();
  expect(metrics.access).toEqual({ unauthorized: 4, forbidden: 2, limited: 0 });
  expect(JSON.stringify(metrics)).not.toContain(token);
  expect(JSON.stringify(metrics)).not.toContain(observer);
});
it("returns 429 before parsing a body, while another client can proceed", async () => {
  let time = 0;
  const access = producerAccess(
    [
      { ...client, requestsPerMinute: 1 },
      { ...client, token: observer },
    ],
    () => time,
  );
  const generate = vi.fn(async () => "0xabcd");
  const { url } = await start(generate, access);
  expect(await requestCertificate(url, {}, fetch, token)).toBe("0xabcd");
  const blocked = await fetch(url, {
    method: "POST",
    body: "{",
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(blocked.status).toBe(429);
  expect(blocked.headers.get("retry-after")).toBeTruthy();
  expect(await requestCertificate(url, {}, fetch, observer)).toBe("0xabcd");
  time = 60000;
  expect(await requestCertificate(url, {}, fetch, token)).toBe("0xabcd");
  expect(generate).toHaveBeenCalledTimes(3);
});
it("holds a disconnected client's slot until its job finishes, then releases it after failure", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const running = new Promise<void>((r) => {
    started = r;
  });
  const access = producerAccess([client]);
  const generate = vi
    .fn()
    .mockImplementationOnce(async () => {
      started();
      await gate;
      throw new Error("RPC failed");
    })
    .mockResolvedValue("0xabcd");
  const { url, port } = await start(generate, access);
  const socket = connect(port, "127.0.0.1");
  await once(socket, "connect");
  socket.write(
    `POST / HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer ${token}\r\nContent-Length: 2\r\n\r\n{}`,
  );
  await running;
  socket.destroy();
  try {
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: "{}",
        })
      ).status,
    ).toBe(429);
  } finally {
    release();
  }
  await new Promise((r) => setImmediate(r));
  expect(await requestCertificate(url, {}, fetch, token)).toBe("0xabcd");
});

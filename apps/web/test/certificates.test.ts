import { describe, it, expect, vi } from "vitest";
import { requestCertificate } from "../src/chain/certificates.js";
describe("proof service failures never cancel missions", () => {
  it("transports bytes for on-chain verification without accepting a validity flag", async () => {
    const f = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ certificate: "0xabcd", valid: false })));
    expect(await requestCertificate("https://prover.test", { mission: 1n }, f)).toBe("0xabcd");
    expect(JSON.parse(f.mock.calls[0]![1].body).mission).toBe("1");
  });
  it("retries service failures instead of producing invalid evidence", async () => {
    const f = vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 }));
    await expect(requestCertificate("https://prover.test", {}, f)).rejects.toThrow("retry later");
  });
  it("does not interpret malformed output as an invalid certificate", async () => {
    for (const data of [
      { valid: false },
      { certificate: "plain:garbage" },
      { certificate: "0x0" },
    ]) {
      const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(data)));
      await expect(requestCertificate("https://prover.test", {}, f)).rejects.toThrow("Malformed");
    }
  });
  it("propagates network and timeout errors", async () => {
    const f = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(requestCertificate("https://prover.test", {}, f)).rejects.toThrow("network down");
  });
});

it("sends authorization in headers and rejects redirects and access failures", async () => {
  for (const status of [401, 403, 429]) {
    const f = vi.fn().mockResolvedValue(new Response("", { status }));
    await expect(
      requestCertificate("http://prover.test", { mission: "1" }, f, "private-token"),
    ).rejects.toThrow("retry later");
    expect(f.mock.calls[0]![1]).toMatchObject({
      redirect: "error",
      headers: { Authorization: "Bearer private-token" },
    });
    expect(f.mock.calls[0]![1].body).not.toContain("private-token");
  }
});

it("does not start a request after a caller stop", async () => {
  const abort = new AbortController();
  const reason = new Error("operator stop");
  abort.abort(reason);
  const fetcher = vi.fn();
  await expect(
    requestCertificate("https://prover.test", {}, fetcher, undefined, abort.signal),
  ).rejects.toBe(reason);
  expect(fetcher).not.toHaveBeenCalled();
});
it("cancels a response body without turning it into an invalidity certificate", async () => {
  const { createServer } = await import("node:http");
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.write('{"certificate":"');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const abort = new AbortController();
  const reason = new Error("operator stop during certificate body");
  let receivedHeaders!: () => void;
  const headers = new Promise<void>((resolve) => {
    receivedHeaders = resolve;
  });
  const fetcher: typeof fetch = async (...args) => {
    const response = await fetch(...args);
    receivedHeaders();
    return response;
  };
  const task = requestCertificate(
    `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    {},
    fetcher,
    undefined,
    abort.signal,
  );
  const outcome = task.catch((error: unknown) => error);
  try {
    await headers;
    abort.abort(reason);
    expect(await outcome).toBe(reason);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

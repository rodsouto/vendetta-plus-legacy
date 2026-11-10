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

it("rejects non-string certificate values without coercion", async () => {
  for (const data of [null, [], { certificate: ["0xabcd"] }, { certificate: {} }]) {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(data)));
    await expect(requestCertificate("https://prover.test", {}, fetcher)).rejects.toThrow(
      "Malformed certificate response",
    );
  }
});

it("bounds the response before JSON parsing independently of Content-Length", async () => {
  for (const headers of [{}, { "content-length": "1" }]) {
    let cancelled = false;
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulls === 10) {
          controller.close();
          return;
        }
        pulls++;
        controller.enqueue(new TextEncoder().encode(" ".repeat(8192)));
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetcher = vi.fn().mockResolvedValue(new Response(body, { headers }));
    await expect(requestCertificate("https://prover.test", {}, fetcher)).rejects.toThrow(
      "Certificate response too large",
    );
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(10);
    expect(body.locked).toBe(false);
  }
});

it("cancels an unsuccessful response without consuming its body", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    cancel() {
      cancelled = true;
    },
  });
  const fetcher = vi.fn().mockResolvedValue(new Response(body, { status: 503 }));
  await expect(requestCertificate("https://prover.test", {}, fetcher)).rejects.toThrow(
    "retry later",
  );
  expect(cancelled).toBe(true);
});

it("accepts the maximum certificate and the exact decoded-body budget", async () => {
  const certificate = `0x${"ab".repeat(16384)}`;
  const json = JSON.stringify({ certificate });
  for (const content of [json, json.padEnd(65536, " ")]) {
    const fetcher = vi.fn().mockResolvedValue(new Response(content));
    expect(await requestCertificate("https://prover.test", {}, fetcher)).toBe(certificate);
  }
  const fetcher = vi.fn().mockResolvedValue(new Response(json.padEnd(65537, " ")));
  await expect(requestCertificate("https://prover.test", {}, fetcher)).rejects.toThrow("too large");
  const overlong = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ certificate: certificate + "ab" })));
  await expect(requestCertificate("https://prover.test", {}, overlong)).rejects.toThrow(
    "Malformed",
  );
});

it("counts UTF-8 bytes and rejects malformed, missing and truncated bodies", async () => {
  const oversized = JSON.stringify({ certificate: "0xab", padding: "é".repeat(32768) });
  for (const body of [oversized, "", "{", new Uint8Array([0xff])]) {
    await expect(
      requestCertificate("https://prover.test", {}, vi.fn().mockResolvedValue(new Response(body))),
    ).rejects.toThrow("retry later");
  }
  await expect(
    requestCertificate("https://prover.test", {}, vi.fn().mockResolvedValue(new Response(null))),
  ).rejects.toThrow("Malformed");
});

it("cancels and unlocks the reader when body reading fails", async () => {
  const failure = new Error("synthetic broken stream");
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(failure);
    },
  });
  await expect(
    requestCertificate("https://prover.test", {}, vi.fn().mockResolvedValue(new Response(body))),
  ).rejects.toBe(failure);
  expect(body.locked).toBe(false);
});

it("rejects oversized decoded gzip data over real HTTP and recovers on the next request", async () => {
  const { createServer } = await import("node:http");
  const { gzipSync } = await import("node:zlib");
  const large = gzipSync(JSON.stringify({ certificate: "0xab", padding: " ".repeat(65536) }));
  let calls = 0;
  const server = createServer((_req, res) => {
    calls++;
    if (calls === 1) {
      res.writeHead(200, { "content-encoding": "gzip", "content-length": large.length });
      res.end(large);
    } else {
      res.end(JSON.stringify({ certificate: "0xabcd" }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    expect(large.length).toBeLessThan(65536);
    await expect(requestCertificate(url, {})).rejects.toThrow("too large");
    expect(await requestCertificate(url, {})).toBe("0xabcd");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("transports both producer ABI envelopes through the real HTTP handler", async () => {
  // Synthetic proof bytes: serialization/transport compatibility, no cryptographic claim.
  const { encodeAbiParameters } = await import("viem");
  const { producerServer } = await import("../scripts/prover/http.js");
  for (const kind of [1, 2]) {
    const inputs =
      kind === 1
        ? encodeAbiParameters([{ type: "uint256[55]" }], [Array(55).fill(0n) as never])
        : encodeAbiParameters([{ type: "uint256[2]" }], [[0n, 0n]]);
    const certificate = encodeAbiParameters(
      [{ type: "uint8" }, { type: "bytes" }, { type: "bytes" }],
      [kind, `0x${"11".repeat(384)}`, inputs],
    );
    const generate = vi.fn(async () => certificate);
    const server = producerServer(generate);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      expect(await requestCertificate(url, { mission: 1n })).toBe(certificate);
      expect(generate).toHaveBeenCalledWith({ mission: "1" });
      expect(new TextEncoder().encode(JSON.stringify({ certificate })).length).toBeLessThan(65536);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
});

it("cancels an overflowing chunked HTTP response without waiting for EOF", async () => {
  const { createServer } = await import("node:http");
  let closed = false;
  const server = createServer((_req, res) => {
    res.on("close", () => {
      closed = true;
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.write(" ".repeat(65537)); // Deliberately no end().
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    await expect(requestCertificate(url, {})).rejects.toThrow("too large");
    await vi.waitFor(() => expect(closed).toBe(true));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("keeps access failures and oversized responses distinguishable in safe logs", async () => {
  const { serviceErrorSummary } = await import("../scripts/service-errors.js");
  for (const [status, message] of [
    [401, "Prover authentication failed; retry later"],
    [403, "Prover access forbidden; retry later"],
    [429, "Prover rate limited; retry later"],
    [503, "Prover unavailable; retry later"],
  ] as const) {
    let cancelled = false;
    const body = new ReadableStream({
      cancel() {
        cancelled = true;
      },
    });
    const fetcher = vi.fn().mockResolvedValue(new Response(body, { status }));
    const error = await requestCertificate(
      "https://prover.test/?key=synthetic-secret",
      {},
      fetcher,
    ).catch((error: unknown) => error);
    expect(serviceErrorSummary(error)).toEqual({ type: "Error", message });
    expect(cancelled).toBe(true);
  }
  const fetcher = vi.fn().mockResolvedValue(new Response(" ".repeat(65537)));
  const error = await requestCertificate("https://prover.test", {}, fetcher).catch(
    (error: unknown) => error,
  );
  expect(serviceErrorSummary(error)).toEqual({
    type: "Error",
    message: "Certificate response too large; retry later",
  });
});

it("preserves BOM and uppercase hex compatibility", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('\ufeff{"certificate":"0xABCD"}'));
  expect(await requestCertificate("https://prover.test", {}, fetcher)).toBe("0xABCD");
});

it("rejects real HTTP redirects without contacting the target or forwarding authorization", async () => {
  const { createServer } = await import("node:http");
  let targetCalls = 0;
  const target = createServer((_req, res) => {
    targetCalls++;
    res.end('{"certificate":"0xab"}');
  });
  await new Promise<void>((resolve) => target.listen(0, "127.0.0.1", resolve));
  const source = createServer((_req, res) => {
    res.writeHead(302, {
      location: `http://127.0.0.1:${(target.address() as { port: number }).port}/`,
    });
    res.end();
  });
  try {
    await new Promise<void>((resolve) => source.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(source.address() as { port: number }).port}`;
    await expect(requestCertificate(url, {}, fetch, "synthetic-token")).rejects.toThrow();
    expect(targetCalls).toBe(0);
  } finally {
    for (const server of [source, target]) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
});

it("propagates caller stop before response headers", async () => {
  const { createServer } = await import("node:http");
  let received!: () => void;
  const arrived = new Promise<void>((resolve) => {
    received = resolve;
  });
  const server = createServer(() => {
    received();
  }); // Never sends headers.
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const abort = new AbortController();
  const reason = new Error("synthetic stop before headers");
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const outcome = requestCertificate(url, {}, fetch, undefined, abort.signal).catch(
    (error: unknown) => error,
  );
  try {
    await arrived;
    abort.abort(reason);
    expect(await outcome).toBe(reason);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it.each(["no-stop", "inactive-stop", "timeout-before-stop"] as const)(
  "preserves timeout precedence while awaiting headers (%s)",
  async (mode) => {
    const { createServer } = await import("node:http");
    let received!: () => void;
    const arrived = new Promise<void>((resolve) => {
      received = resolve;
    });
    const server = createServer(() => {
      received();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    // Exercise signal routing without waiting 120 seconds. This does not measure a real deadline.
    const timeout = new AbortController();
    const spy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeout.signal);
    const stop = new AbortController();
    const timeoutReason = new DOMException("synthetic timeout", "TimeoutError");
    const stopReason = new Error("synthetic later stop");
    try {
      const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      const outcome = requestCertificate(
        url,
        {},
        fetch,
        undefined,
        mode === "no-stop" ? undefined : stop.signal,
      ).catch((error: unknown) => error);
      await arrived;
      expect(spy).toHaveBeenCalledWith(120000);
      timeout.abort(timeoutReason);
      if (mode === "timeout-before-stop") stop.abort(stopReason);
      expect(await outcome).toBe(timeoutReason);
    } finally {
      spy.mockRestore();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);

it("does not return a complete certificate after caller stop", async () => {
  const abort = new AbortController();
  const reason = new Error("synthetic stop after payload");
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"certificate":"0xabcd"}'));
      abort.abort(reason);
      controller.close();
    },
  });
  // The injected fetcher ignores abort: the final boundary must still reject.
  const fetcher = vi.fn().mockResolvedValue(new Response(body));
  // Abort after request admission rather than before the request's initial guard.
  const stop = new AbortController();
  const forwarding: typeof fetch = async (...args) => {
    const response = await fetcher(...args);
    if (abort.signal.aborted) stop.abort(reason);
    return response;
  };
  await expect(
    requestCertificate("https://prover.test", {}, forwarding, undefined, stop.signal),
  ).rejects.toBe(reason);
  expect(fetcher).toHaveBeenCalledOnce();
});

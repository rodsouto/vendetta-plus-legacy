import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, it } from "vitest";
import { benchmarkFetch } from "../scripts/experiments/producer-benchmark-http.js";
import { parseProcessStat } from "../scripts/experiments/producer-resources.js";

it("reads CPU, RSS and process identity with spaces/parentheses in comm", () => {
  const fields = Array<string>(22).fill("0");
  fields[0] = "R";
  fields[11] = "230";
  fields[12] = "70";
  fields[19] = "456";
  fields[21] = "1024";
  expect(parseProcessStat(`123 (a (strange) name) ${fields.join(" ")}`, 100, 4096)).toEqual({
    cpuSeconds: 3,
    rssBytes: 4194304,
    startTicks: "456",
  });
  expect(() => parseProcessStat("123 (broken) R", 100, 4096)).toThrow();
});
it("waits for a queued benchmark response using its own deadline and does not follow redirects", async () => {
  let authorized = false,
    redirected = false;
  const server = createServer((req, res) => {
    authorized = req.headers.authorization === "Bearer local-token";
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: "/target" }).end();
    } else if (req.url === "/target") {
      redirected = true;
      res.end();
    } else setTimeout(() => res.end("ready"), 50);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const fetcher = benchmarkFetch(1000, "local-token");
    expect(await (await fetcher(url, { signal: AbortSignal.abort() })).text()).toBe("ready");
    expect(authorized).toBe(true);
    await expect(benchmarkFetch(1000, "local-token", AbortSignal.abort())(url)).rejects.toThrow();
    const stopping = new AbortController();
    const request = benchmarkFetch(1000, "local-token", stopping.signal)(url);
    stopping.abort();
    await expect(request).rejects.toThrow();
    expect((await fetcher(url + "/redirect")).status).toBe(302);
    expect(redirected).toBe(false);
    await expect(benchmarkFetch(10, "local-token")(url)).rejects.toThrow();
    await expect(fetcher("https://example.com")).rejects.toThrow("loopback");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

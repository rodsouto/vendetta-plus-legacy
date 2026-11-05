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

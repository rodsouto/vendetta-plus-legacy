import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { hiddenResolution as h } from "../src/sim/index.js";
import { buildResolutionTraces } from "../scripts/experiments/hidden-resolution-vectors.js";
const ROOT = "0x" + "12".repeat(32);
const PLAIN = Buffer.from(
  "02010101020000000000000000000000000000000000000000000000000000000000000005",
  "hex",
);
describe("inactive hidden resolution kernel", () => {
  it("keeps committed differential traces current", () => {
    const fixture = JSON.parse(
      readFileSync(new URL("../generated/hidden-resolution.json", import.meta.url), "utf8"),
    );
    expect(buildResolutionTraces()).toEqual(fixture.cases);
  });
  it("copies a Buffer input and consumed bytes instead of retaining shared views", () => {
    const receipt = h.initialize(undefined, ROOT, 100n, 7n),
      input = Buffer.from(PLAIN);
    h.recordVerified(receipt, ROOT, true, input);
    input[36] = 99;
    expect(receipt.plain[36]).toBe(5);
    const result = h.consume(receipt, 7300n);
    result.plain[36] = 88;
    expect(receipt.plain[36]).toBe(5);
    expect(result.arrival).toBe(100n);
    expect(result.seq).toBe(7n);
  });
  it("keeps a pending receipt indefinitely and rejects consumption without evidence", () => {
    const receipt = h.initialize(undefined, ROOT, 100n, 7n);
    expect(() => h.consume(receipt, 10n ** 12n)).toThrow("ResolutionPending");
    expect(receipt.status).toBe(h.PENDING);
    expect(receipt.consumed).toBe(false);
  });
  it("never allows a conflicting verified result to choose a different outcome", () => {
    const receipt = h.initialize(undefined, ROOT, 100n, 7n);
    h.recordVerified(receipt, ROOT, true, PLAIN);
    expect(() => h.recordVerified(receipt, ROOT, false, new Uint8Array())).toThrow(
      "ResolutionConflict",
    );
    expect(receipt.status).toBe(h.VALID);
  });
});

import { describe, expect, it } from "vitest";
import { newRecoveryCode, parseRecoveryCode, recoveryKey } from "../src/account/recovery.js";

describe("recovery codes", () => {
  it("round-trips: six groups of four, 120 bits", () => {
    for (let i = 0; i < 50; i++) {
      const code = newRecoveryCode();
      expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
      const bytes = parseRecoveryCode(code)!;
      expect(bytes).toMatch(/^0x[0-9a-f]{30}$/);
      expect(recoveryKey(bytes)).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it("forgives case, spaces, missing dashes and I/L/O typed for 1/0", () => {
    const code = "0011-AAAA-BBBB-CCCC-DDDD-EEEE";
    const bytes = parseRecoveryCode(code);
    expect(parseRecoveryCode(" ooil aaaa bbbb cccc dddd eeee ")).toBe(bytes);
    expect(parseRecoveryCode("0011AAAABBBBCCCCDDDDEEEE")).toBe(bytes);
  });

  it("rejects wrong lengths and characters", () => {
    expect(parseRecoveryCode("0011-AAAA")).toBeNull();
    expect(parseRecoveryCode("0011-AAAA-BBBB-CCCC-DDDD-EEEU")).toBeNull();
  });
});

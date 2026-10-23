// Every custom error the game contracts declare has a message in both languages, so a revert is
// never shown as a raw `errors.X` key.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../src/i18n/en.json";
import es from "../src/i18n/es.json";

const declared = [
  ...readFileSync(
    new URL("../../../contracts/src/core/GameErrors.sol", import.meta.url),
    "utf8",
  ).matchAll(/^error (\w+)\(/gm),
].map((m) => m[1]!);

describe("i18n", () => {
  it("has a message for every game error", () => {
    expect(declared.length).toBeGreaterThan(50);
    for (const dict of [en, es]) {
      const errors = dict.errors as Record<string, string>;
      expect(declared.filter((n) => !errors[n])).toEqual([]);
    }
  });
});

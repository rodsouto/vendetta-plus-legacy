// Every custom error the game contracts declare has a message in both languages, so a revert is
// never shown as a raw `errors.X` key; the rulebook has the same sections in both.
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

  it("has the same rulebook shape in both languages", () => {
    const shape = (dict: typeof en) =>
      dict.rules.sections.map((s) =>
        s.body.map((b) => (typeof b === "string" ? "p" : "ol" in b ? b.ol.length : -b.ul.length)),
      );
    expect(shape(es)).toEqual(shape(en));
  });
});

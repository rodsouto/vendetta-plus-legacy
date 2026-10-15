import { describe, expect, it } from "vitest";
import { vectors } from "@vendetta/spec-data/vectors";
import { rulesets } from "../src/index.js";

describe("spec data", () => {
  it("loads the Vendetta ruleset", () => {
    expect(rulesets.vendetta.ruleset).toBe("vendetta");
    expect(rulesets.vendetta.troops.length).toBe(21);
  });

  it.each(Object.entries(vectors))("%s test vectors have cases", (_name, sections) => {
    const withCases = Object.values(sections).filter((s) => Array.isArray(s?.cases));
    expect(withCases.length).toBeGreaterThan(0);
    for (const section of withCases) expect(section.cases.length).toBeGreaterThan(0);
  });
});

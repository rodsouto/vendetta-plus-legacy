import { describe, expect, it } from "vitest";
import { dependencyProbes } from "../scripts/experiments/dependency-probes.js";

describe("local frontier research: actual simulator dependencies", () => {
  const probes = dependencyProbes();
  it("covers nine conflicts and three qualified positive controls", () => {
    expect(probes.filter((p) => p.expected === "conflict")).toHaveLength(9);
    expect(probes.filter((p) => p.expected === "commutes-on-projection")).toHaveLength(3);
  });
  it("records observable effects beyond abstract resource overlap", () => {
    const research = probes.find((p) => p.name === "remote-research-affects-battle")!;
    expect(research.chronological).toMatchObject({ survivors: expect.arrayContaining([68n]) });
    expect(research.overtaken).toMatchObject({ survivors: expect.arrayContaining([74n]) });
    const market = probes.find((p) => p.name === "market-acceptance-from-outside-cover")!;
    expect(market.chronological).toMatchObject({ acceptance: "CannotAfford", accepted: false });
    expect(market.overtaken).toMatchObject({ acceptance: "ok", accepted: true });
  });
  for (const probe of probes) {
    it(`${probe.name}: ${probe.expected}`, () => {
      expect(probe.matches).toBe(probe.expected === "commutes-on-projection");
    });
  }
});

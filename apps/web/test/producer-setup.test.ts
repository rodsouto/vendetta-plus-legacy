import { describe, expect, it } from "vitest";
import { validateSetupManifest } from "../scripts/prover/setup.js";

const manifest = {
  kind: "opening" as const,
  profile: "VENDETTA_OPENING_V2",
  unsafeLocalSetup: true,
};
describe("producer setup policy", () => {
  it.each([1, 100, 10200])("rejects unsafe keys on chain %i even with opt-in", (chain) => {
    expect(() => validateSetupManifest(manifest, "opening", chain, true)).toThrow(
      "Unsafe local setup",
    );
  });
  it.each([1337, 31337])("requires explicit opt-in on local chain %i", (chain) => {
    expect(() => validateSetupManifest(manifest, "opening", chain)).toThrow("Unsafe local setup");
    expect(() => validateSetupManifest(manifest, "opening", chain, true)).not.toThrow();
  });
  it.each([undefined, null, 0, "false"])(
    "rejects missing or malformed safety flag %s",
    (unsafeLocalSetup) => {
      expect(() =>
        validateSetupManifest({ ...manifest, unsafeLocalSetup }, "opening", 100),
      ).toThrow("Wrong setup manifest");
    },
  );
  it.each([1, 100, 10200, 1337, 31337])(
    "rejects self-declared secure keys on chain %i even with local opt-in",
    (chain) => {
      for (const kind of ["opening", "invalid-point"] as const)
        expect(() =>
          validateSetupManifest({ ...manifest, kind, unsafeLocalSetup: false }, kind, chain, true),
        ).toThrow("Secure setup provenance verification is not implemented");
    },
  );
  it("rejects wrong circuit/profile before evaluating setup provenance", () => {
    const secure = { ...manifest, unsafeLocalSetup: false };
    expect(() => validateSetupManifest(secure, "invalid-point", 100)).toThrow(
      "Wrong setup manifest",
    );
    expect(() => validateSetupManifest({ ...secure, profile: "v1" }, "opening", 100)).toThrow(
      "Wrong setup manifest",
    );
  });
});

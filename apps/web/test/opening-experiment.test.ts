import { describe, expect, it } from "vitest";
import { decodeHiddenPlain, encodeHiddenPlain, sim } from "@vendetta/rules";
import { bls12_381 } from "@noble/curves/bls12-381";
import { timelockDecrypt } from "tlock-js";
import {
  beacon1001,
  loadOpeningCases,
  offlineClient,
} from "../scripts/experiments/opening-fixtures.js";
import {
  deriveFileKey,
  evaluateOpening,
  parseEnvelope,
  statementDigest,
  verifyBeacon,
  validatePlain,
} from "../scripts/experiments/opening.js";

const cases = loadOpeningCases();
describe("offline timelock opening research predicate", () => {
  it("has positive, invalid, unavailable, untrusted and unsupported cases", () => {
    expect(cases).toHaveLength(24);
    expect(new Set(cases.map((c) => c.expected))).toEqual(
      new Set(["valid", "invalid", "wait", "untrusted", "unsupported"]),
    );
  });
  for (const c of cases)
    it(c.name, () => {
      const { result } = evaluateOpening(c.ciphertext, c.context, c.beacon, BigInt(c.now));
      expect(result.status).toBe(c.expected);
      if (c.expectedReason) expect(result).toMatchObject({ reason: c.expectedReason });
    });
  it("binds chain, instance, mission, rules and immutable send parameters", () => {
    const context = cases[0]!.context;
    const digest = statementDigest(context);
    for (const patch of [
      { chainId: "101" },
      { game: "0x2222222222222222222222222222222222222222" },
      { mission: "2" },
      { ruleset: "another-ruleset" },
      { owner: "2" },
      { from: { ...context.from, slot: "2" } },
      { cover: "3" },
      { cargo: ["1", "0", "0", "0"] },
      { arrival: String(BigInt(context.arrival) + 1n) },
      { round: 1001 },
      { commitment: "0x" + "00".repeat(32) },
      { ciphertextHash: "0x" + "00".repeat(32) },
    ])
      expect(statementDigest({ ...context, ...patch })).not.toBe(digest);
  });
  it("cannot turn a forged beacon into a deterministic ciphertext rejection", () => {
    const valid = cases[0]!;
    const forged = { ...valid.beacon!, signature: "00".repeat(48) };
    expect(verifyBeacon(forged, valid.context.round)).toBe(false);
    expect(
      evaluateOpening(valid.ciphertext, valid.context, forged, BigInt(valid.now)).result.status,
    ).toBe("untrusted");
  });
  it("preserves current decoder semantics instead of rejecting a valid extra element", () => {
    expect(decodeHiddenPlain('[1,1,1,2,5,"ignored"]')).not.toBeNull();
    const fixture = cases.find((c) => c.name === "legacy-decoder-extra-element")!;
    expect(
      evaluateOpening(fixture.ciphertext, fixture.context, fixture.beacon, BigInt(fixture.now))
        .result.status,
    ).toBe("valid");
  });
  it("rejects malformed and identity capsule points before pairing", () => {
    const fixture = cases[0]!;
    const parsed = parseEnvelope(fixture.ciphertext);
    if ("status" in parsed) throw new Error("Fixture did not parse");
    for (const u of [new Uint8Array(96), bls12_381.G2.ProjectivePoint.ZERO.toRawBytes()]) {
      expect(deriveFileKey({ ...parsed, u }, fixture.beacon!)).toMatchObject({ status: "invalid" });
    }
  });
  it("does not classify a context supplied for the wrong round as invalid ciphertext", () => {
    const fixture = cases[0]!;
    expect(
      evaluateOpening(
        fixture.ciphertext,
        { ...fixture.context, round: 1001 },
        fixture.beacon,
        BigInt(fixture.now),
      ).result,
    ).toMatchObject({ status: "unsupported", reason: "context-round-profile" });
  });
  it("does not invalidate an earlier-round ciphertext that the current decoder can open", async () => {
    const fixture = cases[0]!;
    const context = {
      ...fixture.context,
      round: 1001,
      arrival: String(BigInt(fixture.context.arrival) + 3n),
    };
    const plain = await timelockDecrypt(fixture.ciphertext, offlineClient);
    expect(validatePlain(plain, context).status).toBe("valid");
    expect(
      evaluateOpening(fixture.ciphertext, context, beacon1001, BigInt(fixture.now)).result,
    ).toMatchObject({ status: "unsupported", reason: "ciphertext-round-profile" });
  });
  it("does not invalidate a later-round ciphertext solely because it misses the research profile", async () => {
    const fixture = cases.find((c) => c.name === "ciphertext-for-wrong-future-round")!;
    const plain = await timelockDecrypt(fixture.ciphertext, offlineClient);
    expect(validatePlain(plain, fixture.context).status).toBe("valid");
    expect(
      evaluateOpening(fixture.ciphertext, fixture.context, fixture.beacon, BigInt(fixture.now))
        .result.status,
    ).toBe("unsupported");
  });
  it("keeps an unaligned stored arrival outside the profile without declaring ciphertext invalid", () => {
    const fixture = cases[0]!;
    expect(
      evaluateOpening(
        fixture.ciphertext,
        { ...fixture.context, arrival: String(BigInt(fixture.context.arrival) + 1n) },
        fixture.beacon,
        BigInt(fixture.now),
      ).result,
    ).toMatchObject({ status: "unsupported", reason: "context-round-profile" });
  });
  it("returns no verdict for inputs beyond the research resource bound", () => {
    const fixture = cases[0]!;
    expect(
      evaluateOpening("A".repeat(131073), fixture.context, fixture.beacon, BigInt(fixture.now))
        .result,
    ).toMatchObject({ status: "unsupported", reason: "research-size-bound" });
  });
  it("accepts a full uint256 salt without reducing it modulo a proof field", () => {
    const salt = (1n << 256n) - 1n;
    const message = { kind: sim.ATTACK, target: { city: 1n, neighborhood: 1n, slot: 2n }, salt };
    const context = {
      ...cases[0]!.context,
      commitment: sim.hiddenCommit(1n, message.kind, message.target, salt),
    };
    expect(validatePlain(Buffer.from(encodeHiddenPlain(message)), context).status).toBe("valid");
  });
  it("rejects a salt outside the contract ABI domain before checking the commitment", () => {
    const message = {
      kind: sim.ATTACK,
      target: { city: 1n, neighborhood: 1n, slot: 2n },
      salt: 1n << 256n,
    };
    expect(validatePlain(Buffer.from(encodeHiddenPlain(message)), cases[0]!.context)).toMatchObject(
      { status: "invalid", reason: "message-domain" },
    );
  });
});

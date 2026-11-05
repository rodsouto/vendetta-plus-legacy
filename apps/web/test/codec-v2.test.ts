import { describe, expect, it } from "vitest";
import { timelockDecrypt } from "tlock-js";
import { sim } from "@vendetta/rules";
import { encodeAbiParameters, keccak256, toHex } from "viem";
import { QUICKNET, RULES_DIGEST } from "../scripts/experiments/opening.js";
import {
  decodePacketV2,
  decodePlainV2,
  encodePacketV2,
  encodePlainV2,
  encryptPlainV2,
  headerV2,
  MAX_V2_ROUND,
  PACKET_V2_BYTES,
  packetV2ToArmor,
} from "../scripts/experiments/codec-v2.js";
import { offlineClient } from "../scripts/experiments/opening-fixtures.js";
const base = { kind: 1, target: { city: 1n, neighborhood: 1n, slot: 2n }, salt: 5n };
const packet = () =>
  encodePacketV2({
    round: 1000n,
    capsule: Buffer.alloc(128),
    mac: Buffer.alloc(32),
    body: Buffer.alloc(69),
  });
describe("future fixed v2 codec (research)", () => {
  it("pins the on-chain profile to the circuit's current rules and quicknet identity", () => {
    expect("0x" + sim.hiddenContext.PROFILE).toBe(
      keccak256(
        encodeAbiParameters(
          [{ type: "bytes32" }, { type: "bytes32" }],
          [keccak256(toHex("vendetta-opening-research-v1")), RULES_DIGEST],
        ),
      ),
    );
    expect(sim.hiddenContext.NETWORK).toBe(QUICKNET.hash);
    expect("0x" + sim.hiddenContext.PUBLIC_KEY_HASH).toBe(
      keccak256(("0x" + QUICKNET.public_key) as `0x${string}`),
    );
  });
  it("preserves all 256 salt bits and the existing commitment", () => {
    for (const salt of [
      0n,
      5n,
      (1n << 256n) - 1n,
      21888242871839275222246405745257275088548364400416034343698204186575808495622n,
    ]) {
      const plain = { ...base, salt };
      const encoded = encodePlainV2(plain);
      expect(encoded).toHaveLength(37);
      const decoded = decodePlainV2(encoded)!;
      expect(decoded).toEqual(plain);
      expect(sim.hiddenCommit(1n, decoded.kind, decoded.target, decoded.salt)).toBe(
        sim.hiddenCommit(1n, plain.kind, plain.target, plain.salt),
      );
    }
  });
  it("rejects truncation, trailing bytes and unrecognized plaintext versions", () => {
    const p = encodePlainV2(base);
    expect(decodePlainV2(p.subarray(1))).toBeNull();
    expect(decodePlainV2(Buffer.concat([p, Buffer.from([0])]))).toBeNull();
    p[0] = 1;
    expect(decodePlainV2(p)).toBeNull();
  });
  it("does not truncate byte fields or salt", () => {
    for (const salt of [-1n, 1n << 256n])
      expect(() => encodePlainV2({ ...base, salt })).toThrow(RangeError);
    for (const kind of [-1, 256, 1.5, NaN])
      expect(() => encodePlainV2({ ...base, kind })).toThrow();
    for (const city of [-1n, 256n])
      expect(() => encodePlainV2({ ...base, target: { ...base.target, city } })).toThrow(
        RangeError,
      );
  });
  it("keeps syntactic encoding separate from mission validity", () => {
    const plain = { ...base, kind: 255, target: { city: 0n, neighborhood: 255n, slot: 0n } };
    expect(decodePlainV2(encodePlainV2(plain))).toEqual(plain);
  });
  it("has an exact fixed packet layout with no ignored suffix", () => {
    const p = packet();
    expect(p).toHaveLength(PACKET_V2_BYTES);
    expect(encodePacketV2(decodePacketV2(p)!)).toEqual(p);
    expect(decodePacketV2(p.subarray(1))).toBeNull();
    expect(decodePacketV2(Buffer.concat([p, Buffer.from([0])]))).toBeNull();
  });
  it("rejects different codec and chain identities", () => {
    for (const offset of [0, 3, 4, 35]) {
      const p = packet();
      p[offset] = p[offset]! ^ 1;
      expect(decodePacketV2(p)).toBeNull();
    }
  });
  it("restricts rounds to the exact native integer domain", () => {
    for (const round of [1n, 1000n, MAX_V2_ROUND]) {
      const p = decodePacketV2(packet())!;
      p.round = round;
      expect(decodePacketV2(encodePacketV2(p))!.round).toBe(round);
      expect(headerV2(round, p.capsule).length).toBe(headerV2(1n, p.capsule).length);
    }
    for (const round of [0n, MAX_V2_ROUND + 1n]) {
      const p = packet();
      p.writeBigUInt64BE(round, 36);
      expect(decodePacketV2(p)).toBeNull();
      expect(() => encodePacketV2({ ...decodePacketV2(packet())!, round })).toThrow(RangeError);
    }
  });
  for (const salt of [5n, (1n << 256n) - 1n])
    it(`encrypts using public inputs and opens through native tlock-js, salt ${salt}`, async () => {
      const plain = { ...base, salt };
      const p = await encryptPlainV2(plain, 1000n);
      expect(p).toHaveLength(273);
      const opened = await timelockDecrypt(packetV2ToArmor(p), offlineClient);
      expect(decodePlainV2(opened)).toEqual(plain);
      for (const offset of [172, 204, 220, 272]) {
        const altered = Buffer.from(p);
        altered[offset] = altered[offset]! ^ 1;
        await expect(timelockDecrypt(packetV2ToArmor(altered), offlineClient)).rejects.toThrow();
      }
    });
});

import { describe, it, expect } from "vitest";
import { timelockDecrypt } from "tlock-js";
import {
  encodePlain,
  decodePlain,
  decodePacket,
  encryptPacket,
  packetToArmor,
} from "../src/chain/codec.js";
import { offlineClient } from "../scripts/experiments/opening-fixtures.js";
const plain = {
  kind: 1,
  target: { city: 1n, neighborhood: 1n, slot: 2n },
  salt: (1n << 256n) - 1n,
};
describe("single browser v2 wire protocol", () => {
  it("preserves all plaintext fields and all salt bits", () => {
    expect(encodePlain(plain)).toHaveLength(37);
    expect(decodePlain(encodePlain(plain))).toEqual(plain);
    expect(decodePlain(new Uint8Array(36))).toBeNull();
  });
  it("encrypts a canonical packet that native tlock decrypts", async () => {
    const packet = await encryptPacket(plain, 1000n);
    expect(packet).toHaveLength(273);
    expect(decodePacket(packet)!.round).toBe(1000n);
    const decrypted = await timelockDecrypt(packetToArmor(packet), offlineClient);
    expect(decodePlain(decrypted)).toEqual(plain);
  });
  it("rejects legacy text and alternate framing", () => {
    expect(decodePacket(new TextEncoder().encode("plain:[1,2,3]"))).toBeNull();
    expect(decodePacket(new Uint8Array(274))).toBeNull();
  });
});

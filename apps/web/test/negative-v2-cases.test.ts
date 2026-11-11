import { describe, it, expect } from "vitest";
import { timelockDecrypt } from "tlock-js";
import { encodeHiddenPlain } from "@vendetta/rules";
import { validatePlain, type Context } from "../scripts/experiments/opening.js";
import {
  definition,
  negativeCases,
  preparePacket,
} from "../scripts/experiments/negative-v2-cases.js";
import { decodePlainV2, packetV2ToArmor } from "../scripts/experiments/codec-v2.js";
import { offlineClient } from "../scripts/experiments/opening-fixtures.js";
const origin = { city: 25n, neighborhood: 25n, slot: 99n };
describe("negative acceptance packet isolation (offline, no proving)", () => {
  for (const name of negativeCases.filter((n) => !n.startsWith("u-"))) {
    it(name, async () => {
      const item = await preparePacket(name, 1000n, 1n, origin);
      const packet = Buffer.from(item.packet.slice(2), "hex");
      const decrypt = () => timelockDecrypt(packetV2ToArmor(packet), offlineClient);
      if (name === "bad-mac" || name === "bad-tag") await expect(decrypt()).rejects.toThrow();
      else expect(decodePlainV2(await decrypt())).toEqual(definition(name, origin).plain);
      expect(packet.length).toBe(273);
      if (!["bad-mac", "bad-tag"].includes(name)) {
        const context: Context = {
          chainId: "31337",
          game: "0x" + "11".repeat(20),
          mission: "1",
          ruleset: "vendetta",
          owner: "1",
          from: { city: "25", neighborhood: "25", slot: "99" },
          cover: String(item.cover),
          cargo: item.cargo.map(String),
          arrival: "1",
          round: 1000,
          commitment: item.commitment,
          ciphertextHash: "0x" + "00".repeat(32),
        };
        const result = validatePlain(Buffer.from(encodeHiddenPlain(item.plain)), context);
        const reasons: Record<string, string> = {
          "wrong-commitment": "commitment-mismatch",
          "city-out-of-map": "message-target",
          "neighborhood-out-of-map": "message-target",
          "slot-out-of-map": "message-target",
          "same-origin": "message-target",
          "outside-cover": "message-cover",
          "cargo-non-transport": "message-cargo",
        };
        expect(result.status).toBe(item.valid ? "valid" : "invalid");
        if (result.status === "invalid") expect(result.reason).toBe(reasons[name]);
      }
    });
  }
  it("point cases replace U while retaining fixed framing", async () => {
    for (const name of negativeCases.filter((n) => n.startsWith("u-"))) {
      const item = await preparePacket(name, 1000n, 1n, origin);
      expect(item.packet.length).toBe(548);
      expect(item.valid).toBe(false);
    }
  });
});

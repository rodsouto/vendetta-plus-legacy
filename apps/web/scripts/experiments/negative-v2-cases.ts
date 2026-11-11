// Acceptance packet construction. Never imports archived encryption keys or signatures.
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { sha256 } from "@noble/hashes/sha256";
import { sim, type HiddenPlain } from "@vendetta/rules";
import { toHex } from "viem";
import { QUICKNET } from "./opening.js";
import { encodePlainV2, sealPacketV2 } from "./codec-v2.js";
const require = createRequire(import.meta.url);
const { encryptOnG2RFC9380 } =
  require("tlock-js/crypto/ibe") as typeof import("tlock-js/crypto/ibe");
export const negativeCases = [
  "u-compression",
  "u-identity",
  "u-noncanonical",
  "u-off-curve",
  "u-subgroup",
  "bad-mac",
  "bad-tag",
  "wrong-commitment",
  "city-out-of-map",
  "neighborhood-out-of-map",
  "slot-out-of-map",
  "same-origin",
  "outside-cover",
  "cargo-non-transport",
  "transport-cargo",
  "max-salt",
] as const;
export const faultCases = [
  "fake-signature",
  "wrong-round-signature",
  "beacon-unavailable",
  "producer-unavailable",
] as const;
export type CaseName = (typeof negativeCases)[number];
export function definition(name: CaseName, origin: HiddenPlain["target"]) {
  const plain: HiddenPlain = {
    kind: sim.TRANSPORT,
    target: { ...origin, slot: origin.slot + 1n },
    salt: name === "max-salt" ? (1n << 256n) - 1n : 5n,
  };
  if (name === "city-out-of-map") plain.target.city = 51n;
  if (name === "neighborhood-out-of-map") plain.target.neighborhood = 51n;
  if (name === "slot-out-of-map") plain.target.slot = 0n;
  if (name === "same-origin") plain.target = { ...origin };
  if (name === "outside-cover") plain.target.city = origin.city + 1n;
  if (name === "cargo-non-transport") plain.kind = sim.ATTACK;
  return {
    name,
    plain,
    cover: 1n,
    cargo: [name === "transport-cargo" || name === "cargo-non-transport" ? 1n : 0n, 0n, 0n, 0n],
    valid: name === "transport-cargo" || name === "max-salt",
  };
}
export async function preparePacket(
  name: CaseName,
  round: bigint,
  owner: bigint,
  origin: HiddenPlain["target"],
) {
  const d = definition(name, origin);
  const key = randomBytes(16),
    salt = randomBytes(16),
    roundBytes = Buffer.alloc(8);
  roundBytes.writeBigUInt64BE(round);
  const encrypted = await encryptOnG2RFC9380(
    Buffer.from(QUICKNET.public_key, "hex"),
    sha256(roundBytes),
    key,
  );
  const capsule = Buffer.concat([encrypted.U, encrypted.V, encrypted.W]);
  if (name.startsWith("u-")) {
    const vectors = JSON.parse(
      readFileSync(
        new URL(
          "../../../../docs/benchmarks/timelock-opening/invalid-point/vectors.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ).vectors as { name: string; encoded: string }[];
    const selected: Record<string, string> = {
      "u-identity": "identity",
      "u-noncanonical": "noncanonical-0",
      "u-off-curve": "nonsquare-x",
      "u-subgroup": "on-curve-outside-subgroup",
    };
    if (name === "u-compression") capsule[0] = capsule[0]! & 127;
    else {
      const v = vectors.find((v) => v.name === selected[name]);
      if (!v || v.encoded.length !== 192) throw new Error("Missing pinned point fixture: " + name);
      capsule.set(Buffer.from(v.encoded, "hex"), 0);
    }
  }
  // Seal AFTER changing U, so unrelated MAC/tag damage cannot explain point failures.
  const packet = sealPacketV2(round, capsule, key, encodePlainV2(d.plain), salt);
  if (name === "bad-mac") packet[172] = packet[172]! ^ 1;
  if (name === "bad-tag") packet[272] = packet[272]! ^ 1;
  const commitment =
    name === "wrong-commitment"
      ? toHex(0n, { size: 32 })
      : sim.hiddenCommit(owner, d.plain.kind, d.plain.target, d.plain.salt);
  // File key and payload salt are intentionally not returned or persisted.
  return { ...d, packet: toHex(packet), commitment };
}

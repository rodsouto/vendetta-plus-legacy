// Research codec only. Not selected by the production sender or keeper.
import { createRequire } from "node:module";
import { createHmac, hkdfSync, randomBytes } from "node:crypto";
import { ChaCha20Poly1305 } from "@stablelib/chacha20poly1305";
import { sha256 } from "@noble/hashes/sha256";
import type { HiddenPlain } from "@vendetta/rules";
import { QUICKNET } from "./opening.js";
const require = createRequire(import.meta.url);
const { encryptOnG2RFC9380 } =
  require("tlock-js/crypto/ibe") as typeof import("tlock-js/crypto/ibe");
const { encodeArmor } = require("tlock-js/age/armor") as typeof import("tlock-js/age/armor");
export const PLAIN_V2_BYTES = 37;
export const PACKET_V2_BYTES = 273;
export const MAX_V2_ROUND = (1n << 53n) - 1n;
const magic = Buffer.from("VDH2");
const network = Buffer.from(QUICKNET.hash, "hex");
const byte = (value: number | bigint): number => {
  const n = BigInt(value);
  if (n < 0n || n > 255n) throw new RangeError("codec byte outside uint8");
  return Number(n);
};
export function encodePlainV2(plain: HiddenPlain): Buffer {
  if (!Number.isInteger(plain.kind)) throw new RangeError("non-integer mission kind");
  if (plain.salt < 0n || plain.salt >= 1n << 256n) throw new RangeError("salt outside uint256");
  return Buffer.concat([
    Buffer.from([
      2,
      byte(plain.kind),
      byte(plain.target.city),
      byte(plain.target.neighborhood),
      byte(plain.target.slot),
    ]),
    Buffer.from(plain.salt.toString(16).padStart(64, "0"), "hex"),
  ]);
}
export function decodePlainV2(input: Uint8Array): HiddenPlain | null {
  if (input.length !== PLAIN_V2_BYTES || input[0] !== 2) return null;
  return {
    kind: input[1]!,
    target: { city: BigInt(input[2]!), neighborhood: BigInt(input[3]!), slot: BigInt(input[4]!) },
    salt: BigInt("0x" + Buffer.from(input.subarray(5)).toString("hex")),
  };
}
export interface PacketV2 {
  round: bigint;
  capsule: Uint8Array;
  mac: Uint8Array;
  body: Uint8Array;
}
function checkRound(round: bigint) {
  if (round < 1n || round > MAX_V2_ROUND)
    throw new RangeError("round outside native safe integer range");
}
export function encodePacketV2(p: PacketV2): Buffer {
  checkRound(p.round);
  if (p.capsule.length !== 128 || p.mac.length !== 32 || p.body.length !== 69)
    throw new RangeError("wrong packet field length");
  const round = Buffer.alloc(8);
  round.writeBigUInt64BE(p.round);
  return Buffer.concat([magic, network, round, p.capsule, p.mac, p.body]);
}
export function decodePacketV2(input: Uint8Array): PacketV2 | null {
  const b = Buffer.from(input);
  if (
    b.length !== PACKET_V2_BYTES ||
    !b.subarray(0, 4).equals(magic) ||
    !b.subarray(4, 36).equals(network)
  )
    return null;
  const round = b.readBigUInt64BE(36);
  if (round < 1n || round > MAX_V2_ROUND) return null;
  return { round, capsule: b.subarray(44, 172), mac: b.subarray(172, 204), body: b.subarray(204) };
}
// Fixed-width round text is authenticated, not an alternative numeric spelling.
// Leading zeroes are intentional in this new codec and accepted by native tlock-js.
export function headerV2(round: bigint, capsule: Uint8Array): Buffer {
  checkRound(round);
  if (capsule.length !== 128) throw new RangeError("wrong capsule length");
  const b64 = Buffer.from(capsule).toString("base64").replace(/=+$/, "");
  const lines = b64.match(/.{1,64}/g)!;
  return Buffer.from(
    `age-encryption.org/v1\n-> tlock ${String(round).padStart(16, "0")} ${QUICKNET.hash}\n${lines.join("\n")}\n---`,
  );
}
export function packetV2ToArmor(input: Uint8Array): string {
  const p = decodePacketV2(input);
  if (!p) throw new Error("not a v2 packet");
  const raw = Buffer.concat([
    headerV2(p.round, p.capsule),
    Buffer.from(" " + Buffer.from(p.mac).toString("base64").replace(/=+$/, "") + "\n"),
    p.body,
  ]);
  return encodeArmor(raw.toString("binary"));
}
export const payloadKeyV2 = (key: Uint8Array, salt: Uint8Array) =>
  Buffer.from(hkdfSync("sha256", key, salt, "payload", 32));
export function sealPacketV2(
  round: bigint,
  capsule: Uint8Array,
  key: Uint8Array,
  plain: Uint8Array,
  payloadSalt: Uint8Array,
): Buffer {
  if (key.length !== 16 || payloadSalt.length !== 16 || plain.length !== 37)
    throw new RangeError("wrong encryption field length");
  const header = headerV2(round, capsule);
  const mac = createHmac(
    "sha256",
    Buffer.from(hkdfSync("sha256", key, Buffer.alloc(0), "header", 32)),
  )
    .update(header)
    .digest();
  const nonce = Buffer.alloc(12);
  nonce[11] = 1;
  const sealed = new ChaCha20Poly1305(payloadKeyV2(key, payloadSalt)).seal(nonce, plain);
  return encodePacketV2({ round, capsule, mac, body: Buffer.concat([payloadSalt, sealed]) });
}
// Uses public chain identity only; it never fetches a beacon or receives a signature.
export async function encryptPlainV2(plain: HiddenPlain, round: bigint): Promise<Buffer> {
  checkRound(round);
  const raw = encodePlainV2(plain);
  const key = randomBytes(16),
    salt = randomBytes(16),
    roundBytes = Buffer.alloc(8);
  roundBytes.writeBigUInt64BE(round);
  const c = await encryptOnG2RFC9380(
    Buffer.from(QUICKNET.public_key, "hex"),
    sha256(roundBytes),
    key,
  );
  return sealPacketV2(round, Buffer.concat([c.U, c.V, c.W]), key, raw, salt);
}

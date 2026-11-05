// The sole hidden mission wire format: 37-byte plaintext and 273-byte quicknet packet.
import { sha256 } from "@noble/hashes/sha256";
import { hmac } from "@noble/hashes/hmac";
import { hkdf } from "@noble/hashes/hkdf";
import { concatBytes, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils";
import { ChaCha20Poly1305 } from "@stablelib/chacha20poly1305";
import { defaultChainInfo } from "tlock-js";
import type { HiddenPlain } from "@vendetta/rules";
const network = hexToBytes(defaultChainInfo.hash);
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/=+$/, "");
function word(n: bigint): Uint8Array {
  if (n < 0n || n >= 1n << 256n) throw new RangeError("uint256");
  return hexToBytes(n.toString(16).padStart(64, "0"));
}
export function encodePlain(p: HiddenPlain): Uint8Array {
  const fields = [
    2,
    p.kind,
    Number(p.target.city),
    Number(p.target.neighborhood),
    Number(p.target.slot),
  ];
  if (fields.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    throw new RangeError("plaintext byte");
  return concatBytes(Uint8Array.from(fields), word(p.salt));
}
export function decodePlain(b: Uint8Array): HiddenPlain | null {
  if (b.length !== 37 || b[0] !== 2) return null;
  return {
    kind: b[1]!,
    target: { city: BigInt(b[2]!), neighborhood: BigInt(b[3]!), slot: BigInt(b[4]!) },
    salt: BigInt("0x" + Array.from(b.subarray(5), (x) => x.toString(16).padStart(2, "0")).join("")),
  };
}
export function decodePacket(b: Uint8Array) {
  if (
    b.length !== 273 ||
    !b.subarray(0, 4).every((x, i) => x === [86, 68, 72, 50][i]) ||
    !network.every((x, i) => b[4 + i] === x)
  )
    return null;
  let round = 0n;
  for (const x of b.subarray(36, 44)) round = (round << 8n) | BigInt(x);
  if (round < 1n || round > (1n << 53n) - 1n) return null;
  return { round, capsule: b.subarray(44, 172), mac: b.subarray(172, 204), body: b.subarray(204) };
}
function header(round: bigint, capsule: Uint8Array): Uint8Array {
  return utf8ToBytes(
    `age-encryption.org/v1\n-> tlock ${String(round).padStart(16, "0")} ${defaultChainInfo.hash}\n${b64(
      capsule,
    )
      .match(/.{1,64}/g)!
      .join("\n")}\n---`,
  );
}
export async function encryptPacket(plain: HiddenPlain, round: bigint): Promise<Uint8Array> {
  if (round < 1n || round > (1n << 53n) - 1n) throw new RangeError("round");
  const { encryptOnG2RFC9380 } = await import("tlock-js/crypto/ibe");
  const roundBytes = new Uint8Array(8);
  new DataView(roundBytes.buffer).setBigUint64(0, round);
  const key = randomBytes(16),
    salt = randomBytes(16);
  const c = await encryptOnG2RFC9380(
    hexToBytes(defaultChainInfo.public_key),
    sha256(roundBytes),
    key,
  );
  const capsule = concatBytes(c.U, c.V, c.W),
    h = header(round, capsule);
  const mac = hmac(sha256, hkdf(sha256, key, new Uint8Array(), utf8ToBytes("header"), 32), h);
  const nonce = new Uint8Array(12);
  nonce[11] = 1;
  const cipher = new ChaCha20Poly1305(hkdf(sha256, key, salt, utf8ToBytes("payload"), 32));
  return concatBytes(
    Uint8Array.from([86, 68, 72, 50]),
    network,
    roundBytes,
    capsule,
    mac,
    salt,
    cipher.seal(nonce, encodePlain(plain)),
  );
}
export function packetToArmor(packet: Uint8Array): string {
  const p = decodePacket(packet);
  if (!p) throw new Error("Invalid hidden packet");
  const bytes = concatBytes(
    header(p.round, p.capsule),
    utf8ToBytes(" " + b64(p.mac) + "\n"),
    p.body,
  );
  const text = b64(bytes);
  const padded = text + "=".repeat((4 - (text.length % 4)) % 4);
  return `-----BEGIN AGE ENCRYPTED FILE-----\n${padded.match(/.{1,64}/g)!.join("\n")}\n-----END AGE ENCRYPTED FILE-----\n`;
}

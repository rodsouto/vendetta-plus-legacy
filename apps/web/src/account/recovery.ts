// Recovery codes (B-15, B-26): 120 random bits the player writes down, shown as six groups of four
// base32 characters. The code derives a key whose simple 4337 account (like a session's) is one
// more controller of the player, so on a new device it can add that device's passkey account.
import { concatHex, keccak256, toHex, type Hex } from "viem";
import { store } from "./store.js";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford: no I, L, O, U
const BYTES = 15;
const DOMAIN = toHex("vendetta recovery v1");

/** A new code, e.g. "7KQ2-M9XD-…" (24 characters). */
export function newRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(BYTES));
  let bits = 0n;
  for (const b of bytes) bits = (bits << 8n) | BigInt(b);
  let out = "";
  for (let i = BYTES * 8 - 5; i >= 0; i -= 5) out += ALPHABET[Number((bits >> BigInt(i)) & 31n)];
  return out.match(/.{4}/g)!.join("-");
}

/** The code's bytes, or null when it is not a well-formed code. Forgiving with case and dashes. */
export function parseRecoveryCode(text: string): Hex | null {
  const clean = text.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
  if (clean.length !== (BYTES * 8) / 5) return null;
  let bits = 0n;
  for (const c of clean) {
    const v = ALPHABET.indexOf(c);
    if (v < 0) return null;
    bits = (bits << 5n) | BigInt(v);
  }
  return toHex(bits, { size: BYTES });
}

/** The private key behind a code (never stored). */
export const recoveryKey = (code: Hex): Hex => keccak256(concatHex([DOMAIN, code]));

// The code's account this device recovered with (its controller key), so the device list
// suggests replacing it: a used code may have been seen. The chain itself tells codes from devices.
const usedKey = (chainId: number) => `vendetta.recoveryUsed.${chainId}`;
export const usedRecovery = (chainId: number) => store.get<string>(usedKey(chainId)) ?? undefined;
export const rememberUsedRecovery = (chainId: number, controller: string) =>
  store.set(usedKey(chainId), controller);

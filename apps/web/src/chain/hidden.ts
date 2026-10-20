// Hidden missions on the client (B-22): the timelock that keeps (kind, target, salt) secret until
// the mission arrives, this device's own plaintexts, and the ciphertexts of everyone else's.
//
// - drand: tlock for the drand quicknet round at the arrival (plus a margin, so nobody can decrypt
//   before the mission lands). tlock-js loads on first use, like the passkey stack.
// - plain: local chains only. Anvil's clock jumps (the Workshop's time travel) and drand's does
//   not, so the plaintext travels as is: anyone can read it, which is fine for development.
import { fromHex, toHex, type Address, type Hex, type PublicClient } from "viem";
import { decodeHiddenPlain, encodeHiddenPlain, type HiddenPlain } from "@vendetta/rules";
import { gameAbi } from "./abi.js";
import type { Network } from "./networks.js";

export interface Timelock {
  /** Ciphertext nobody can open before `arrival` (chain time, seconds). */
  encrypt(plain: HiddenPlain, arrival: bigint): Promise<Hex>;
  /** The plaintext, or null while it is still locked or when it is garbage. */
  decrypt(ciphertext: Hex): Promise<HiddenPlain | null>;
}

/** Seconds after the arrival that the drand round is picked for: covers inclusion latency. */
const ROUND_MARGIN = 10n;

const PLAIN = "plain:";

const plainTimelock: Timelock = {
  encrypt: async (p) => toHex(PLAIN + encodeHiddenPlain(p)),
  decrypt: async (c) => {
    const text = fromHex(c, "string");
    return text.startsWith(PLAIN) ? decodeHiddenPlain(text.slice(PLAIN.length)) : null;
  },
};

const tlock = () => import("tlock-js");

const drandTimelock: Timelock = {
  async encrypt(p, arrival) {
    const { mainnetClient, roundAt, timelockEncrypt, Buffer } = await tlock();
    const client = mainnetClient();
    const round = roundAt(Number(arrival + ROUND_MARGIN) * 1000, await client.chain().info());
    return toHex(await timelockEncrypt(round, Buffer.from(encodeHiddenPlain(p)), client));
  },
  async decrypt(c) {
    const { mainnetClient, timelockDecrypt } = await tlock();
    try {
      const out = await timelockDecrypt(fromHex(c, "string"), mainnetClient());
      return decodeHiddenPlain(out.toString());
    } catch {
      return null; // too early, or not a tlock ciphertext
    }
  },
};

export const timelockFor = (network: Network): Timelock =>
  network.id === "arbitrum" ? drandTimelock : plainTimelock;

/** A random 256-bit salt. */
export function randomSalt(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return BigInt(toHex(bytes));
}

// ------------------------------------------------------------------ own plaintexts

// Per player account: another player on the same browser must not see these targets.
const storeKey = (game: Address, owner: string) => `hidden:${game.toLowerCase()}:${owner}`;

/** Plaintexts this device sent for `owner` (its account key), by commitment. */
export function storedPlains(game: Address, owner: string): Map<string, HiddenPlain> {
  const out = new Map<string, HiddenPlain>();
  if (!owner) return out;
  try {
    const raw = JSON.parse(localStorage.getItem(storeKey(game, owner)) ?? "{}") as Record<
      string,
      string
    >;
    for (const [commit, text] of Object.entries(raw)) {
      const p = decodeHiddenPlain(text);
      if (p) out.set(commit, p);
    }
  } catch {
    /* private mode or corrupt: other clients and the keeper still reveal from the ciphertext */
  }
  return out;
}

export function storePlain(game: Address, owner: string, commit: string, p: HiddenPlain): void {
  try {
    const key = storeKey(game, owner);
    const raw = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, string>;
    raw[commit.toLowerCase()] = encodeHiddenPlain(p);
    localStorage.setItem(key, JSON.stringify(raw));
  } catch {
    /* see storedPlains */
  }
}

// ------------------------------------------------------------------ others' ciphertexts

/** The ciphertext `HiddenMissionSent` carried for a mission, or null when it is not found. */
export async function ciphertextOf(
  client: PublicClient,
  game: Address,
  fromBlock: number,
  mission: bigint,
): Promise<Hex | null> {
  const logs = await client.getContractEvents({
    address: game,
    abi: gameAbi,
    eventName: "HiddenMissionSent",
    args: { mission },
    fromBlock: BigInt(fromBlock),
  } as never);
  const last = logs.at(-1) as { args: { ciphertext: Hex } } | undefined;
  return last?.args.ciphertext ?? null;
}

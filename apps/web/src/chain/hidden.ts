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

/**
 * What opening a ciphertext says: the plaintext; `locked` while its round is not out yet; or
 * `garbage`, which no round will ever open (not a tlock envelope, or not a plaintext of ours). A
 * transient failure (drand or the network down) throws instead, so a keeper never mistakes it for
 * garbage (B-22).
 */
export type Opened = { plain: HiddenPlain } | { locked: true } | { garbage: true };

export interface Timelock {
  /** Ciphertext nobody can open before `arrival` (chain time, seconds). */
  encrypt(plain: HiddenPlain, arrival: bigint): Promise<Hex>;
  /**
   * The latest arrival the ciphertext made for `arrival` allows: a mission that lands later would
   * open before it lands (B-22). `sendHiddenMission` takes it as its deadline.
   */
  deadline(arrival: bigint): Promise<bigint>;
  /** Opens a ciphertext, or says why it cannot be opened (see Opened). */
  open(ciphertext: Hex): Promise<Opened>;
  /** The plaintext, or null while it is still locked or when it is garbage. */
  decrypt(ciphertext: Hex): Promise<HiddenPlain | null>;
}

/** Seconds after the arrival that the drand round is picked for: covers inclusion latency. */
const ROUND_MARGIN = 10n;

/** No timelock on local chains: the deadline is as late as the contract can store (uint40). */
const NO_DEADLINE = 2n ** 40n - 1n;

const PLAIN = "plain:";

const decryptOf =
  (open: Timelock["open"]): Timelock["decrypt"] =>
  async (c) => {
    const o = await open(c);
    return "plain" in o ? o.plain : null;
  };

const openPlain: Timelock["open"] = async (c) => {
  let text: string;
  try {
    text = fromHex(c, "string");
  } catch {
    return { garbage: true };
  }
  if (!text.startsWith(PLAIN)) return { garbage: true };
  const plain = decodeHiddenPlain(text.slice(PLAIN.length));
  return plain ? { plain } : { garbage: true };
};

const plainTimelock: Timelock = {
  encrypt: async (p) => toHex(PLAIN + encodeHiddenPlain(p)),
  deadline: async () => NO_DEADLINE,
  open: openPlain,
  decrypt: decryptOf(openPlain),
};

const tlock = () => import("tlock-js");
const drandRound = async (arrival: bigint) => {
  const { mainnetClient, roundAt, roundTime } = await tlock();
  const client = mainnetClient();
  const info = await client.chain().info();
  const round = roundAt(Number(arrival + ROUND_MARGIN) * 1000, info);
  return { client, round, opensAt: BigInt(Math.floor(roundTime(info, round) / 1000)) };
};

const openDrand: Timelock["open"] = async (c) => {
  const { mainnetClient, timelockDecrypt } = await tlock();
  let text: string;
  try {
    text = fromHex(c, "string");
  } catch {
    return { garbage: true };
  }
  let out: { toString(): string };
  try {
    out = await timelockDecrypt(text, mainnetClient());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/too early/i.test(message)) return { locked: true };
    // tlock-js parses the envelope before any network call: those errors are the envelope's.
    if (/stanza|armor|age|header|mac|round|parse|decrypt|unsupported/i.test(message)) {
      return { garbage: true };
    }
    throw e; // drand or the network: transient
  }
  const plain = decodeHiddenPlain(out.toString());
  return plain ? { plain } : { garbage: true };
};

const drandTimelock: Timelock = {
  async encrypt(p, arrival) {
    const { timelockEncrypt, Buffer } = await tlock();
    const { client, round } = await drandRound(arrival);
    return toHex(await timelockEncrypt(round, Buffer.from(encodeHiddenPlain(p)), client));
  },
  // drand's roundAt floors: the round picked for arrival + 10 s opens between 8 and 10 s after
  // the arrival. The mission must land before that round opens.
  async deadline(arrival) {
    return (await drandRound(arrival)).opensAt - 1n;
  },
  open: openDrand,
  decrypt: decryptOf(openDrand),
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

/** Every plaintext this browser holds for `game`, whichever account sent it (the workshop). */
export function allStoredPlains(game: Address): Map<string, HiddenPlain> {
  const out = new Map<string, HiddenPlain>();
  try {
    const prefix = `hidden:${game.toLowerCase()}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      for (const [commit, p] of storedPlains(game, key.slice(prefix.length))) out.set(commit, p);
    }
  } catch {
    /* private mode */
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

/** Blocks per `eth_getLogs` query: within what public RPCs accept for a filtered topic. */
const LOG_CHUNK = 5000n;

/**
 * The `HiddenMissionSent` ciphertexts, read from the logs in bounded block ranges and kept by
 * mission id, so a lookup never queries from the deployment block again and an old mission is
 * still found: the scan only moves forward, and a mission not yet seen makes it catch up.
 */
export class CiphertextIndex {
  private readonly found = new Map<bigint, Hex>();
  private scanned: bigint;

  constructor(
    private readonly client: PublicClient,
    private readonly game: Address,
    fromBlock: number,
  ) {
    this.scanned = BigInt(fromBlock) - 1n;
  }

  /** Reads the logs after the last scanned block, up to the chain's head, chunk by chunk. */
  async catchUp(): Promise<void> {
    // Not viem's cached value (`cacheTime`): a scan right after a mined order must see its block.
    const head = await this.client.getBlockNumber({ cacheTime: 0 });
    while (this.scanned < head) {
      const from = this.scanned + 1n;
      const to = from + LOG_CHUNK - 1n < head ? from + LOG_CHUNK - 1n : head;
      const logs = await this.client.getContractEvents({
        address: this.game,
        abi: gameAbi,
        eventName: "HiddenMissionSent",
        fromBlock: from,
        toBlock: to,
      } as never);
      for (const log of logs as unknown as { args: { mission: bigint; ciphertext: Hex } }[]) {
        this.found.set(log.args.mission, log.args.ciphertext);
      }
      this.scanned = to;
    }
  }

  /** The ciphertext of a mission, or null when no log carries it (after catching up). */
  async get(mission: bigint): Promise<Hex | null> {
    if (!this.found.has(mission)) await this.catchUp();
    return this.found.get(mission) ?? null;
  }
}

const indexes = new Map<string, CiphertextIndex>();

/** The ciphertext `HiddenMissionSent` carried for a mission, or null when it is not found. */
export async function ciphertextOf(
  client: PublicClient,
  game: Address,
  fromBlock: number,
  mission: bigint,
): Promise<Hex | null> {
  const key = `${game.toLowerCase()}:${fromBlock}`;
  let index = indexes.get(key);
  if (!index) indexes.set(key, (index = new CiphertextIndex(client, game, fromBlock)));
  return index.get(mission);
}

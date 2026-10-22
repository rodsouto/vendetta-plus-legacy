// Hidden missions on the client (B-22): the timelock that keeps (kind, target, salt) secret until
// the mission arrives, this device's own plaintexts, and the ciphertexts the keeper opens.
//
// - drand: tlock for a drand quicknet round, and a fixed arrival a head start before it: the
//   sender's reveal lands while nobody else can decrypt. The rounds are computed from quicknet's
//   fixed parameters; tlock-js loads on first use, like the passkey stack.
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

/** A hidden send's fixed arrival (0: the natural one) and the round its ciphertext opens at. */
export interface Prepared {
  arrival: bigint;
  round: bigint;
}

export interface Timelock {
  /** Whether the ciphertext hides the plaintext: a reveal must then wait for its arrival on chain. */
  hides: boolean;
  /** The fixed arrival for a mission whose natural one (now + duration) is `natural` (B-22). */
  prepare(natural: bigint): Prepared;
  /** Ciphertext nobody can open before the prepared round. */
  encrypt(plain: HiddenPlain, prepared: Prepared): Promise<Hex>;
  /** Opens a ciphertext, or says why it cannot be opened (see Opened). */
  open(ciphertext: Hex): Promise<Opened>;
}

/**
 * Seconds between the arrival and the round: the sender's reveal must land in them, before anyone
 * else can open the ciphertext (B-22). More than the reveal's inclusion latency on this network.
 */
export const HEAD_START = 8n;

/** Seconds the send may take to be included before its fixed arrival is too early (TooLate). */
export const SEND_MARGIN = 10n;

/** drand quicknet, tlock-js's mainnetClient: its genesis and period are part of its identity. */
export const QUICKNET = {
  hash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  genesis: 1692803367n,
  period: 3n,
};

/**
 * The first quicknet round at or after `natural + SEND_MARGIN + HEAD_START`, and the arrival a
 * head start before it: SEND_MARGIN to SEND_MARGIN + 2 s after the natural arrival. Round r opens
 * at genesis + (r − 1) · period (drand counts from 1).
 */
export function quicknetPrepare(natural: bigint): Prepared {
  const { genesis, period } = QUICKNET;
  const at = natural + SEND_MARGIN + HEAD_START;
  const round = (at - genesis + period - 1n) / period + 1n;
  return { arrival: genesis + (round - 1n) * period - HEAD_START, round };
}

/** The chain info drand serves must be quicknet's: another round schedule could open too early. */
export function checkQuicknet(info: { hash: string; genesis_time: number; period: number }): void {
  if (
    info.hash !== QUICKNET.hash ||
    BigInt(info.genesis_time) !== QUICKNET.genesis ||
    BigInt(info.period) !== QUICKNET.period
  ) {
    throw new Error(`drand chain ${info.hash} is not quicknet`);
  }
}

const PLAIN = "plain:";

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
  hides: false,
  prepare: () => ({ arrival: 0n, round: 0n }),
  encrypt: async (p) => toHex(PLAIN + encodeHiddenPlain(p)),
  open: openPlain,
};

const tlock = () => import("tlock-js");
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
  hides: true,
  prepare: quicknetPrepare,
  async encrypt(p, { round }) {
    const { mainnetClient, timelockEncrypt, Buffer } = await tlock();
    const client = mainnetClient();
    checkQuicknet(await client.chain().info()); // cached: timelockEncrypt reads the same info
    return toHex(await timelockEncrypt(Number(round), Buffer.from(encodeHiddenPlain(p)), client));
  },
  open: openDrand,
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
    /* private mode or corrupt: the keeper still reveals from the ciphertext */
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

import { decodePlain, decodePacket, encryptPacket, packetToArmor } from "./codec.js";
// Hidden missions on the client (B-22): the timelock that keeps (kind, target, salt) secret until
// the mission arrives, this device's own plaintexts, and the ciphertexts the keeper opens.
//
// Every network uses the fixed v2 packet and quicknet schedule. Local clocks do not
// create a plaintext protocol; certificates are required even if a client knows the message.
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
  /** The sole wire protocol encrypts its plaintext on every network. */
  hides: boolean;
  /** The fixed arrival for a mission whose natural one (now + duration) is `natural` (B-22). */
  prepare(natural: bigint): Prepared;
  /** Ciphertext nobody can open before the prepared round. */
  encrypt(plain: HiddenPlain, prepared: Prepared): Promise<Hex>;
  /** Opens a ciphertext, or says why it cannot be opened (see Opened). */
  open(ciphertext: Hex): Promise<Opened>;
}

/**
 * Fixed offset between historical arrival and beacon release, pinned by the v2 circuit.
 * Certificate latency never changes the arrival or causes expiration.
 */
export const HEAD_START = 15n;

/** Seconds the send may take to be included before its fixed arrival is too early (TooLate). */
export const SEND_MARGIN = 20n;

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

/** All networks use the same packet and certificate protocol. */
const drandTimelock: Timelock = {
  hides: true,
  prepare: quicknetPrepare,
  encrypt: async (p, { round }) => toHex(await encryptPacket(p, round)),
  async open(c) {
    const bytes = fromHex(c, "bytes"),
      packet = decodePacket(bytes);
    if (!packet) return { garbage: true };
    const release = QUICKNET.genesis + (packet.round - 1n) * QUICKNET.period;
    if (BigInt(Math.floor(Date.now() / 1000)) < release) return { locked: true };
    const { mainnetClient, timelockDecrypt } = await import("tlock-js");
    const decrypted = await timelockDecrypt(packetToArmor(bytes), mainnetClient());
    const plain = decodePlain(decrypted);
    return plain ? { plain } : { garbage: true };
  },
};
export const timelockFor = (_network: Network): Timelock => drandTimelock;

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
    /* private mode or corrupt: certificate resolution does not depend on this draft */
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

/** Ciphertexts from canonical logs, rescanned from deployment after a reorg. */
export class CiphertextIndex {
  private readonly found = new Map<bigint, Hex>();
  private readonly start: bigint;
  private scanned: bigint;
  private scannedHash: Hex | undefined;
  private scanPending: Promise<void> | undefined;

  constructor(
    private readonly client: PublicClient,
    private readonly game: Address,
    fromBlock: number,
    private readonly signal?: AbortSignal,
  ) {
    this.start = BigInt(fromBlock);
    this.scanned = this.start - 1n;
  }

  private reset() {
    this.found.clear();
    this.scanned = this.start - 1n;
    this.scannedHash = undefined;
  }

  /** Share a scan so concurrent lookups cannot race cursor/cache updates. */
  catchUp(): Promise<void> {
    if (this.scanPending) return this.scanPending;
    const pending = this.scan();
    this.scanPending = pending;
    void pending
      .finally(() => {
        this.scanPending = undefined;
      })
      .catch(() => {});
    return pending;
  }

  private async scan(): Promise<void> {
    this.signal?.throwIfAborted();
    // Never use a cached head immediately after a transaction or a chain revert.
    const head = await this.client.getBlockNumber({ cacheTime: 0 });
    this.signal?.throwIfAborted();
    if (head < this.scanned) this.reset();
    if (
      this.scannedHash &&
      (await this.client.getBlock({ blockNumber: this.scanned })).hash !== this.scannedHash
    )
      this.reset();
    while (this.scanned < head) {
      this.signal?.throwIfAborted();
      const from = this.scanned + 1n;
      const to = from + LOG_CHUNK - 1n < head ? from + LOG_CHUNK - 1n : head;
      const before = await this.client.getBlock({ blockNumber: to });
      this.signal?.throwIfAborted();
      const logs = await this.client.getContractEvents({
        address: this.game,
        abi: gameAbi,
        eventName: "HiddenMissionSent",
        fromBlock: from,
        toBlock: to,
      } as never);
      this.signal?.throwIfAborted();
      const checkpoint = this.scannedHash
        ? (await this.client.getBlock({ blockNumber: this.scanned })).hash
        : undefined;
      this.signal?.throwIfAborted();
      const after = await this.client.getBlock({ blockNumber: to });
      this.signal?.throwIfAborted();
      if (!after.hash || before.hash !== after.hash || checkpoint !== this.scannedHash) {
        this.reset();
        throw new Error("Chain reorganized while indexing hidden packets; retry");
      }
      // Commit logs only after checking that both the old checkpoint and the
      // end of this chunk still identify the branch we queried.
      for (const log of logs as unknown as { args: { mission: bigint; ciphertext: Hex } }[])
        this.found.set(log.args.mission, log.args.ciphertext);
      this.scanned = to;
      this.scannedHash = after.hash;
    }
  }

  /** Validate the checkpoint even for an already cached mission id. */
  async get(mission: bigint): Promise<Hex | null> {
    await this.catchUp();
    return this.found.get(mission) ?? null;
  }
}

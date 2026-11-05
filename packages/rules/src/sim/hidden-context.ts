// Pinned v2 research context used by the opt-in packet-aware admission.
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import type { World, Mission } from "./state.js";
export const NETWORK = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";
export const PUBLIC_KEY_HASH = "b667bf8a4eb1ee843c15c266cea12de2f2b23a108086fcc414c31b0c4b8949fc";
export const PROFILE = "92753eff1c77eda7c8a75a867f4ec66bbe983b31f5cc379974fea3e3b1e35bdd";
export const digest = (bytes: Uint8Array): string => "0x" + bytesToHex(keccak_256(bytes));
export class ContextError extends Error {
  constructor(readonly code: "ResolutionInvalidPacket" | "ResolutionInvalidContext") {
    super(code);
  }
}
export function packetRound(packet: Uint8Array, arrival: bigint): bigint {
  if (
    packet.length !== 273 ||
    bytesToHex(packet.subarray(0, 4)) !== "56444832" ||
    bytesToHex(packet.subarray(4, 36)) !== NETWORK
  )
    throw new ContextError("ResolutionInvalidPacket");
  const round = BigInt("0x" + bytesToHex(packet.subarray(36, 44)));
  if (round < 1n || round > (1n << 53n) - 1n) throw new ContextError("ResolutionInvalidPacket");
  if (1692803367n + (round - 1n) * 3n !== arrival + 15n)
    throw new ContextError("ResolutionInvalidContext");
  return round;
}
/** Execution environment belongs to the host, never to the player's mission request. */
export interface Environment {
  chainId: bigint;
  game: string;
}
export function encode(w: World, id: bigint, packet: Uint8Array, env: Environment): Uint8Array {
  return encodeMission(w.missions.get(id), id, packet, env);
}
/** Context-only adapter for verified on-chain mission views; no World simulation is required. */
export function encodeMission(
  m:
    | Pick<
        Mission,
        "owner" | "hidden" | "returning" | "arrival" | "from" | "cover" | "cargo" | "commit"
      >
    | undefined,
  id: bigint,
  packet: Uint8Array,
  env: Environment,
): Uint8Array {
  if (!m || !m.hidden || m.returning || m.owner === 0n || !/^0x[0-9a-f]{40}$/i.test(env.game))
    throw new ContextError("ResolutionInvalidContext");
  const round = packetRound(packet, m.arrival);
  const words = [
    BigInt(digest(utf8ToBytes("VENDETTA_OPENING_V2"))),
    env.chainId,
    BigInt(env.game),
    id,
    BigInt("0x" + PROFILE),
    m.owner,
    m.from.city,
    m.from.neighborhood,
    m.from.slot,
    m.cover,
    ...m.cargo,
    m.arrival,
    round,
    BigInt("0x" + NETWORK),
    BigInt("0x" + PUBLIC_KEY_HASH),
    BigInt(m.commit),
    BigInt(digest(packet)),
  ];
  if (words.length !== 20 || words.some((v) => v < 0n || v >= 1n << 256n))
    throw new ContextError("ResolutionInvalidContext");
  return hexToBytes(words.map((v) => v.toString(16).padStart(64, "0")).join(""));
}
export function statement(w: World, id: bigint, packet: Uint8Array, env: Environment): string {
  return digest(encode(w, id, packet, env));
}

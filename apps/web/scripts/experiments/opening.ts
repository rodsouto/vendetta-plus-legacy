// Offline reference predicate, not a SNARK verifier or a production garbage detector.
import { createRequire } from "node:module";
import { createHash, timingSafeEqual } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Buffer } from "node:buffer";
import { bls12_381 as bls } from "@noble/curves/bls12-381";
import { sha256 } from "@noble/hashes/sha256";
import { hkdf } from "@noble/hashes/hkdf";
import { ChaCha20Poly1305 } from "@stablelib/chacha20poly1305";
import { defaultChainInfo } from "tlock-js";
import {
  decodeHiddenPlain,
  distance,
  gameConfig,
  rulesets,
  sim,
  vendetta as rules,
  type Coord,
  type HiddenPlain,
} from "@vendetta/rules";
import { encodeAbiParameters, keccak256, toHex, type Address, type Hex } from "viem";

const require = createRequire(import.meta.url);
const { decodeArmor, isProbablyArmored } =
  require("tlock-js/age/armor") as typeof import("tlock-js/age/armor");
const { readAge } =
  require("tlock-js/age/age-reader-writer") as typeof import("tlock-js/age/age-reader-writer");
const { createMacKey } =
  require("tlock-js/age/utils-crypto") as typeof import("tlock-js/age/utils-crypto");
const { fp12ToBytes } = require("tlock-js/crypto/utils") as typeof import("tlock-js/crypto/utils");

export const QUICKNET = Object.freeze({ ...defaultChainInfo });
export const RULES_DIGEST = keccak256(toHex(JSON.stringify([rulesets.vendetta, gameConfig])));
const DST = "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";
const FR = bls.fields.Fr.ORDER;
const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && timingSafeEqual(a, b);
const xor = (a: Uint8Array, b: Uint8Array) => Uint8Array.from(a, (x, i) => x ^ b[i]!);
const hash = (...parts: (string | Uint8Array)[]) =>
  sha256(Buffer.concat(parts.map((p) => Buffer.from(p))));

export interface Beacon {
  round: number;
  signature: string;
  randomness: string;
}
export interface Context {
  chainId: string;
  game: string;
  mission: string;
  ruleset: string;
  owner: string;
  from: { city: string; neighborhood: string; slot: string };
  cover: string;
  cargo: string[];
  arrival: string;
  round: number;
  commitment: string;
  ciphertextHash: string;
}
export type OpeningResult =
  | { status: "valid"; plain: HiddenPlain }
  | { status: "invalid"; reason: string }
  | { status: "wait"; reason: string }
  | { status: "untrusted"; reason: string }
  | { status: "unsupported"; reason: string };

/** A future proof must bind all of this through a canonical encoding checked by the game. */
export function statementDigest(context: Context): string {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "uint256[3]" },
        { type: "uint256" },
        { type: "uint256[4]" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [
        keccak256(toHex("VENDETTA_OPENING_V1")),
        BigInt(context.chainId),
        context.game as Address,
        BigInt(context.mission),
        keccak256(
          encodeAbiParameters(
            [{ type: "bytes32" }, { type: "bytes32" }],
            [keccak256(toHex(context.ruleset)), RULES_DIGEST],
          ),
        ),
        BigInt(context.owner),
        [BigInt(context.from.city), BigInt(context.from.neighborhood), BigInt(context.from.slot)],
        BigInt(context.cover),
        context.cargo.map(BigInt) as [bigint, bigint, bigint, bigint],
        BigInt(context.arrival),
        BigInt(context.round),
        ("0x" + QUICKNET.hash) as Hex,
        keccak256(("0x" + QUICKNET.public_key) as Hex),
        context.commitment as Hex,
        context.ciphertextHash as Hex,
      ],
    ),
  );
}

export function verifyBeacon(beacon: Beacon, round: number): boolean {
  if (
    beacon.round !== round ||
    typeof beacon.signature !== "string" ||
    typeof beacon.randomness !== "string" ||
    !/^[0-9a-f]{96}$/i.test(beacon.signature) ||
    !/^[0-9a-f]{64}$/i.test(beacon.randomness)
  )
    return false;
  const signature = Buffer.from(beacon.signature, "hex");
  if (Buffer.from(sha256(signature)).toString("hex") !== beacon.randomness.toLowerCase())
    return false;
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(round));
  try {
    const s = bls.G1.ProjectivePoint.fromHex(signature);
    const pk = bls.G2.ProjectivePoint.fromHex(QUICKNET.public_key);
    s.assertValidity();
    pk.assertValidity();
    if (s.equals(bls.G1.ProjectivePoint.ZERO) || pk.equals(bls.G2.ProjectivePoint.ZERO))
      return false;
    const h = bls.G1.ProjectivePoint.fromAffine(
      bls.G1.hashToCurve(sha256(bytes), { DST }).toAffine(),
    );
    const product = bls.fields.Fp12.mul(
      bls.pairing(s, bls.G2.ProjectivePoint.BASE),
      bls.pairing(h, pk.negate()),
    );
    return bls.fields.Fp12.eql(product, bls.fields.Fp12.ONE);
  } catch {
    return false;
  }
}

export interface ParsedEnvelope {
  raw: string;
  body: Uint8Array;
  mac: Uint8Array;
  macInput: string;
  round: number;
  chain: string;
  u: Uint8Array;
  v: Uint8Array;
  w: Uint8Array;
}

export function parseEnvelope(ciphertext: string): ParsedEnvelope | OpeningResult {
  let raw: string, parsed: ReturnType<typeof readAge>;
  try {
    raw = isProbablyArmored(ciphertext) ? decodeArmor(ciphertext) : ciphertext;
    parsed = readAge(raw);
  } catch {
    return { status: "invalid", reason: "malformed-age-envelope" };
  }
  if (parsed.header.version !== "age-encryption.org/v1")
    return { status: "unsupported", reason: "age-version" };
  const recipients = parsed.header.recipients;
  if (recipients.length !== 1 || recipients[0]!.type !== "tlock")
    return { status: "unsupported", reason: "recipient-profile" };
  const r = recipients[0]!;
  if (r.args.length !== 2 || !/^[1-9][0-9]*$/.test(r.args[0]!))
    return { status: "unsupported", reason: "round-encoding" };
  const round = Number(r.args[0]);
  if (!Number.isSafeInteger(round)) return { status: "unsupported", reason: "round-range" };
  // Current client wraps a 16-byte age key: G2 compressed (96) + V (16) + W (16).
  if (r.body.length !== 128) return { status: "unsupported", reason: "capsule-profile" };
  const end = raw.indexOf("---");
  if (end < 0) return { status: "invalid", reason: "missing-header-mac" };
  return {
    raw,
    body: parsed.body,
    mac: parsed.header.mac,
    macInput: raw.slice(0, end + 3),
    round,
    chain: r.args[1]!,
    u: r.body.slice(0, 96),
    v: r.body.slice(96, 112),
    w: r.body.slice(112),
  };
}

export function deriveFileKey(
  envelope: ParsedEnvelope,
  beacon: Beacon,
): { fileKey: Uint8Array; gt: ReturnType<typeof bls.pairing> } | OpeningResult {
  let u: ReturnType<typeof bls.G2.ProjectivePoint.fromHex>;
  try {
    u = bls.G2.ProjectivePoint.fromHex(envelope.u);
    u.assertValidity();
    if (u.equals(bls.G2.ProjectivePoint.ZERO))
      return { status: "invalid", reason: "capsule-identity-point" };
  } catch {
    return { status: "invalid", reason: "capsule-invalid-point" };
  }
  const signature = bls.G1.ProjectivePoint.fromHex(beacon.signature);
  const gt = bls.pairing(signature, u);
  const pad = hash("IBE-H2", fp12ToBytes(gt)).slice(0, 16);
  const sigma = xor(envelope.v, pad);
  const fileKey = xor(envelope.w, hash("IBE-H4", sigma).slice(0, 16));
  const pre = hash("IBE-H3", sigma, fileKey);
  let scalar: bigint | undefined;
  for (let i = 1; i < 65535; i++) {
    const counter = Buffer.alloc(2);
    counter.writeUInt16LE(i);
    const candidate = hash(counter, pre);
    candidate[0] = candidate[0]! >> 1;
    const n = BigInt("0x" + Buffer.from(candidate).toString("hex"));
    if (n < FR) {
      scalar = n;
      break;
    }
  }
  if (scalar === undefined) return { status: "unsupported", reason: "h3-rejection-limit" };
  // multiply(0) throws in noble; zero cannot equal the non-identity U above.
  if (scalar === 0n || !bls.G2.ProjectivePoint.BASE.multiply(scalar).equals(u))
    return { status: "invalid", reason: "capsule-rp-check" };
  return { fileKey, gt };
}

export function openAge(envelope: ParsedEnvelope, fileKey: Uint8Array): Uint8Array | OpeningResult {
  const mac = createMacKey(fileKey, "header", envelope.macInput);
  if (!equal(envelope.mac, mac)) return { status: "invalid", reason: "header-authentication" };
  const body = envelope.body;
  // Research profile: one current-client message, not the complete age STREAM language.
  if (body.length < 32) return { status: "invalid", reason: "truncated-body" };
  if (body.length > 65536 + 32) return { status: "unsupported", reason: "multi-chunk-body" };
  const key = hkdf(sha256, fileKey, body.slice(0, 16), Buffer.from("payload"), 32);
  const nonce = new Uint8Array(12);
  nonce[11] = 1;
  const plain = new ChaCha20Poly1305(key).open(nonce, body.slice(16));
  return plain ?? { status: "invalid", reason: "payload-authentication" };
}

export function validatePlain(plain: Uint8Array, context: Context): OpeningResult {
  const message = decodeHiddenPlain(Buffer.from(plain).toString("utf8"));
  if (!message) return { status: "invalid", reason: "message-decoding" };
  const limit = 1n << 256n;
  const { kind, target, salt } = message;
  if (
    !Number.isInteger(kind) ||
    kind < sim.ATTACK ||
    kind > sim.OCCUPY ||
    [target.city, target.neighborhood, target.slot, salt].some((n) => n < 0n || n >= limit)
  )
    return { status: "invalid", reason: "message-domain" };
  if (sim.hiddenCommit(BigInt(context.owner), kind, target, salt) !== context.commitment)
    return { status: "invalid", reason: "commitment-mismatch" };
  const from: Coord = {
    city: BigInt(context.from.city),
    neighborhood: BigInt(context.from.neighborhood),
    slot: BigInt(context.from.slot),
  };
  if (
    target.city < 1n ||
    target.city > rules.config.cities ||
    target.neighborhood < 1n ||
    target.neighborhood > rules.config.neighborhoods ||
    target.slot < 1n ||
    target.slot > rules.config.slots ||
    sim.coordKey(from) === sim.coordKey(target)
  )
    return { status: "invalid", reason: "message-target" };
  if (distance(rules, from, target) > BigInt(context.cover) * rules.config.distanceUnit)
    return { status: "invalid", reason: "message-cover" };
  if (kind !== sim.TRANSPORT && context.cargo.some((v) => BigInt(v) > 0n))
    return { status: "invalid", reason: "message-cargo" };
  return { status: "valid", plain: message };
}

export function evaluateOpening(
  ciphertext: string,
  context: Context,
  beacon: Beacon | null,
  now: bigint,
) {
  const ms: Record<string, number> = {};
  const step = <T>(name: string, fn: () => T) => {
    const start = performance.now();
    const result = fn();
    ms[name] = performance.now() - start;
    return result;
  };
  const finish = (result: OpeningResult) => ({ result, ms, statement: statementDigest(context) });
  if (Buffer.byteLength(ciphertext) > 131072)
    return finish({ status: "unsupported", reason: "research-size-bound" });
  if (keccak256(toHex(ciphertext)) !== context.ciphertextHash)
    return finish({ status: "untrusted", reason: "ciphertext-hash-mismatch" });
  if (context.ruleset !== "vendetta-opening-research-v1")
    return finish({ status: "unsupported", reason: "ruleset-version" });
  const expectedOpen =
    BigInt(QUICKNET.genesis_time) + (BigInt(context.round) - 1n) * BigInt(QUICKNET.period);
  if (expectedOpen !== BigInt(context.arrival) + 15n)
    return finish({ status: "unsupported", reason: "context-round-profile" });
  const envelope = step("parse", () => parseEnvelope(ciphertext));
  if ("status" in envelope) return finish(envelope);
  if (envelope.chain !== QUICKNET.hash)
    return finish({ status: "unsupported", reason: "different-drand-network" });
  if (envelope.round !== context.round)
    return finish({ status: "unsupported", reason: "ciphertext-round-profile" });
  if (now < expectedOpen) return finish({ status: "wait", reason: "round-not-open-yet" });
  if (!beacon) return finish({ status: "wait", reason: "beacon-unavailable" });
  if (!step("beaconAuthentication", () => verifyBeacon(beacon, context.round)))
    return finish({ status: "untrusted", reason: "unauthenticated-beacon" });
  const capsule = step("capsule", () => deriveFileKey(envelope, beacon));
  if ("status" in capsule) return finish(capsule);
  const plain = step("age", () => openAge(envelope, capsule.fileKey));
  if (!(plain instanceof Uint8Array)) return finish(plain);
  return finish(step("mission", () => validatePlain(plain, context)));
}

export const sha256Hex = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

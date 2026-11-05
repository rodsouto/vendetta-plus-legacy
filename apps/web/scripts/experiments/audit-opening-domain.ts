// Executes the current decoder and tlock-js, rather than inferring validity from canonical form.
import { bls12_381 as bls } from "@noble/curves/bls12-381";
import { sha256 } from "@noble/hashes/sha256";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { decodeHiddenPlain, encodeHiddenPlain, sim } from "@vendetta/rules";
import { timelockDecrypt } from "tlock-js";
import { keccak256, toHex } from "viem";
import { beacon1000, beacon1001, loadOpeningCases, offlineClient } from "./opening-fixtures.js";
import {
  QUICKNET,
  deriveFileKey,
  evaluateOpening,
  openAge,
  parseEnvelope,
  validatePlain,
  type ParsedEnvelope,
} from "./opening.js";
const require = createRequire(import.meta.url);
const { decodeArmor, encodeArmor } =
  require("tlock-js/age/armor") as typeof import("tlock-js/age/armor");
const { createMacKey } =
  require("tlock-js/age/utils-crypto") as typeof import("tlock-js/age/utils-crypto");
const { STREAM } =
  require("tlock-js/age/stream-cipher") as typeof import("tlock-js/age/stream-cipher");
const { hkdfSync } = await import("node:crypto");
const base = loadOpeningCases().find((c) => c.name === "valid")!;
const cases: [string, string, "valid" | "invalid"][] = [
  ["canonical", '[1,"1","1","2","5"]', "valid"],
  ["json-whitespace", ' \n [ 1 , "1", "1", "2", "5" ] \t', "valid"],
  ["extra-element", '[1,"1","1","2","5",{"ignored":[null,true]}]', "valid"],
  ["kind-exponent", '[1e0,"1","1","2","5"]', "valid"],
  ["kind-fractional-spelling", '[1.0,"1","1","2","5"]', "valid"],
  ["numeric-coordinates", "[1,1,1,2,5]", "valid"],
  ["leading-zero-strings", '[1,"01","001","02","005"]', "valid"],
  ["signed-and-whitespace-strings", '[1,"+1"," 1 ","+2"," +5 "]', "valid"],
  ["radix-strings", '[1,"0x1","0b1","0o2","0x5"]', "valid"],
  ["boolean-and-array-coercion", "[1,true,true,[2],[5]]", "valid"],
  ["nested-singleton-arrays", '[1,[[1]],[["1"]],[[2]],[["5"]]]', "valid"],
  ["boolean-salt", '[1,"1","1","2",true]', "valid"],
  ["empty-array-salt", '[1,"1","1","2",[]]', "valid"],
  ["null-array-salt", '[1,"1","1","2",[null]]', "valid"],
  ["null-salt", '[1,"1","1","2",null]', "invalid"],
  ["empty-string-salt", '[1,"1","1","2",""]', "valid"],
  ["negative-zero-salt", '[1,"1","1","2","-0"]', "valid"],
  ["unsafe-json-number-rounded", '[1,"1","1","2",9007199254740993]', "valid"],
  ["large-json-number", '[1,"1","1","2",1e77]', "valid"],
  ["numeric-exponent-salt", '[1,"1","1","2",1e3]', "valid"],
  ["string-exponent-is-not-bigint", '[1,"1","1","2","1e3"]', "invalid"],
  ["array-boolean-is-not-boolean", '[1,"1","1","2",[true]]', "invalid"],
  ["object-salt", '[1,"1","1","2",{}]', "invalid"],
  ["missing-salt", '[1,"1","1","2"]', "invalid"],
  ["string-kind", '["1","1","1","2","5"]', "invalid"],
  ["fractional-coordinate", '[1,1.5,"1","2","5"]', "invalid"],
  ["number-above-uint256", '[1,"1","1","2",1e80]', "invalid"],
];
const messages = cases.map(([name, plain, expected]) => {
  const decoded = decodeHiddenPlain(plain);
  const context = structuredClone(base.context);
  if (
    decoded &&
    [decoded.target.city, decoded.target.neighborhood, decoded.target.slot, decoded.salt].every(
      (n) => n >= 0n && n < 1n << 256n,
    )
  )
    context.commitment = sim.hiddenCommit(
      BigInt(context.owner),
      decoded.kind,
      decoded.target,
      decoded.salt,
    );
  const result = validatePlain(Buffer.from(plain), context);
  if (result.status !== expected)
    throw new Error(`Unexpected decoder result: ${name}=${result.status}`);
  const canonical = decoded ? encodeHiddenPlain(decoded) : null;
  return {
    name,
    plain,
    expected,
    reference: result.status,
    reason: result.status === "valid" ? null : result.reason,
    canonical,
    canonicalBytesEqual: plain === canonical,
    decoded: decoded
      ? {
          kind: decoded.kind,
          target: Object.fromEntries(
            Object.entries(decoded.target).map(([k, v]) => [k, String(v)]),
          ),
          salt: String(decoded.salt),
        }
      : null,
  };
});
const envelope = parseEnvelope(base.ciphertext);
if ("status" in envelope) throw new Error("Bad archived envelope");
const kem = deriveFileKey(envelope, beacon1000);
if ("status" in kem) throw new Error("Bad archived capsule");
const raw = decodeArmor(base.ciphertext);
const customHeader = (header: string, body: Uint8Array = envelope.body) =>
  encodeArmor(
    Buffer.concat([
      Buffer.from(header),
      Buffer.from(
        " " +
          Buffer.from(createMacKey(kem.fileKey, "header", header))
            .toString("base64")
            .replace(/=+$/, "") +
          "\n",
      ),
      Buffer.from(body),
    ]).toString("binary"),
  );
const version = "age-encryption.org/v1\n";
const recipient = envelope.macInput.slice(version.length, -3);
const bigPlain = Buffer.from('[1,"1","1","2","5",' + JSON.stringify("x".repeat(66000)) + "]");
const salt = Buffer.alloc(16, 42);
const key = Buffer.from(hkdfSync("sha256", kem.fileKey, salt, "payload", 32));
const bigBody = Buffer.concat([salt, STREAM.seal(bigPlain, key)]);
const envelopes: [string, string, boolean][] = [
  ["canonical-armor", base.ciphertext, true],
  ["unarmored-binary-string", raw, true],
  ["armor-columns-32", encodeArmor(raw, 32), true],
  ["armor-columns-1", encodeArmor(raw, 1), true],
  ["armor-without-base64-padding", base.ciphertext.replace(/=/g, ""), true],
  ["armor-crlf-columns-32", encodeArmor(raw, 32).replace(/\n/g, "\r\n"), true],
  ["armor-crlf-columns-64", base.ciphertext.replace(/\n/g, "\r\n"), false],
  ["armor-trailing-whitespace-1024-total", base.ciphertext + " ".repeat(1023), true],
  ["armor-trailing-whitespace-1025-total", base.ciphertext + " ".repeat(1024), false],
  ["armor-leading-whitespace", " " + base.ciphertext, false],
  ["duplicate-tlock-recipients", customHeader(version + recipient + recipient + "---"), true],
  [
    "round-leading-zeros",
    customHeader(envelope.macInput.replace("tlock 1000 ", "tlock 01000 ")),
    true,
  ],
  [
    "round-numeric-prefix",
    customHeader(envelope.macInput.replace("tlock 1000 ", "tlock 1000suffix ")),
    true,
  ],
  [
    "network-label-not-checked-by-library",
    customHeader(envelope.macInput.replace(envelope.chain, "00".repeat(32))),
    true,
  ],
  ["multi-chunk-with-ignored-json-tail", customHeader(envelope.macInput, bigBody), true],
];
const wire = [];
for (const [name, ciphertext, expected] of envelopes) {
  let accepted = false,
    message: string | null = null,
    error: string | null = null;
  try {
    message = (await timelockDecrypt(ciphertext, offlineClient)).toString();
    accepted = decodeHiddenPlain(message) !== null;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  if (accepted !== expected)
    throw new Error(`Unexpected tlock result: ${name}: ${accepted} ${error}`);
  const context = { ...base.context, ciphertextHash: keccak256(toHex(ciphertext)) };
  const reference = evaluateOpening(ciphertext, context, beacon1000, BigInt(base.now)).result;
  const nativePayloadStatus = message ? validatePlain(Buffer.from(message), context).status : null;
  if (accepted && nativePayloadStatus !== "valid")
    throw new Error(`Native payload is not valid: ${name}`);
  wire.push({
    nativePayloadStatus,
    name,
    utf8Bytes: Buffer.byteLength(ciphertext),
    nativeTlockAccepted: accepted,
    error,
    referenceStatus: reference.status,
    referenceReason: reference.status === "valid" ? null : reference.reason,
    sameAsCanonicalCiphertext: ciphertext === base.ciphertext,
    decodedMessage: message ? decodeHiddenPlain(message) !== null : false,
  });
}
const nativePlain = await timelockDecrypt(base.ciphertext, offlineClient);
const profileGaps = [];
for (const [name, context] of [
  [
    "earlier-ciphertext-round",
    { ...base.context, round: 1001, arrival: String(BigInt(base.context.arrival) + 3n) },
  ],
  ["unaligned-arrival", { ...base.context, arrival: String(BigInt(base.context.arrival) + 1n) }],
] as const) {
  const result = evaluateOpening(base.ciphertext, context, beacon1001, BigInt(base.now)).result;
  if (validatePlain(nativePlain, context).status !== "valid" || result.status !== "unsupported")
    throw new Error("Profile mismatch must not invalidate a native-valid payload");
  profileGaps.push({
    name,
    nativePayloadStatus: "valid",
    referenceStatus: result.status,
    referenceReason: result.reason,
  });
}
const oldCommit = (salt: bigint) => {
  const bytes = Uint8Array.from(
    [1n, 1n, 1n, 1n, 2n, salt]
      .map((x) => x.toString(16).padStart(64, "0"))
      .join("")
      .match(/../g)!
      .map((x) => parseInt(x, 16)),
  );
  return keccak256(bytes);
};
const wordGuard = [];
for (const [bad, alias] of [
  [1n << 256n, 1n << 252n],
  [-5n, 251n],
]) {
  let rejected = false;
  try {
    sim.hiddenCommit(1n, 1, { city: 1n, neighborhood: 1n, slot: 2n }, bad!);
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    rejected = true;
  }
  const oldAlias = oldCommit(bad!) === oldCommit(alias!);
  if (!oldAlias || !rejected) throw new Error("Commit word regression not reproduced/rejected");
  wordGuard.push({
    input: String(bad),
    historicalAlias: String(alias),
    historicalEncoderAliased: oldAlias,
    currentEncoderRejected: rejected,
  });
}

const { fp12ToBytes } = require("tlock-js/crypto/utils") as typeof import("tlock-js/crypto/utils");
const hashParts = (...parts: (string | Uint8Array)[]) =>
  sha256(Buffer.concat(parts.map((p) => Buffer.from(p))));
const xor = (a: Uint8Array, b: Uint8Array) => Uint8Array.from(a, (v, i) => v ^ b[i]!);
// Observer recovery receives no beacon/signature or secret key. pre plus public encryption
// parameters exposes r, and e(H(round), PK)^r is the sender's original shared secret.
function recoverFromPublishedPre(pre: Uint8Array, packet: ParsedEnvelope): Uint8Array {
  let r: bigint | undefined;
  for (let i = 1; i < 65535; i++) {
    const index = Buffer.alloc(2);
    index.writeUInt16LE(i);
    const digest = hashParts(index, pre);
    digest[0] = digest[0]! >> 1;
    const n = BigInt("0x" + Buffer.from(digest).toString("hex"));
    if (n < bls.fields.Fr.ORDER) {
      r = n;
      break;
    }
  }
  if (r === undefined || r === 0n) throw new Error("Observer fixture has no nonzero scalar");
  if (!bls.G2.ProjectivePoint.BASE.multiply(r).equals(bls.G2.ProjectivePoint.fromHex(packet.u)))
    throw new Error("Observer pre is not linked to this U");
  const round = Buffer.alloc(8);
  round.writeBigUInt64BE(BigInt(packet.round));
  const h = bls.G1.ProjectivePoint.fromAffine(
    bls.G1.hashToCurve(sha256(round), {
      DST: "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_",
    }).toAffine(),
  );
  const shared = bls.fields.Fp12.pow(
    bls.pairing(h, bls.G2.ProjectivePoint.fromHex(QUICKNET.public_key)),
    r,
  );
  const sigma = xor(packet.v, hashParts("IBE-H2", fp12ToBytes(shared)).slice(0, 16));
  const fileKey = xor(packet.w, hashParts("IBE-H4", sigma).slice(0, 16));
  const result = openAge(packet, fileKey);
  if (!(result instanceof Uint8Array)) throw new Error("Observer recovery failed");
  return result;
}
const originalSigma = xor(envelope.v, hashParts("IBE-H2", fp12ToBytes(kem.gt)).slice(0, 16));
const publishedPre = hashParts("IBE-H3", originalSigma, kem.fileKey);
const recovered = recoverFromPublishedPre(publishedPre, envelope);
if (Buffer.from(recovered).toString() !== nativePlain.toString())
  throw new Error("Observer recovered different plaintext");
const prePrivacy = {
  publishedPreAllowsRecoveryWithoutBeaconSignature: true,
  observerInputs: "pre, public PK/round and ciphertext only",
  plaintextMatchesSource: true,
  fixturePreparation:
    "pre prepared from archived opening; observer function itself receives no signature or secret key",
  consequence:
    "Do not publish pre or r at send time. Honest H3 pagination must occur after opening; this prototype has no release-time enforcement.",
};
const h3 = JSON.parse(
  readFileSync(
    new URL("../../../../docs/benchmarks/timelock-opening/h3-bound-probe.json", import.meta.url),
    "utf8",
  ),
);
const report = {
  scope:
    "Executable current-decoder acceptance audit; not a new verifier, proof, or production policy",
  node: process.version,
  messageCases: messages,
  profileGaps,
  prePrivacy,
  commitmentWordGuardRegressions: wordGuard,
  wireCases: wire,
  h3ActualCounterRange: {
    first: 1,
    last: 65534,
    source: "tlock-js 0.9.0 crypto/ibe.js: i < 65535",
  },
  existingValidFiveCandidateProbe: h3,
  notes: [
    "Native acceptance is not a recommendation to preserve all quirks in a future codec; changing validity requires explicit version/admission policy.",
    "Reference unsupported is a coverage gap; a valid native input is not garbage because the research profile cannot certify it.",
    "Recomputed context commitments in message cases isolate decoding semantics; this is not proof of a packet's on-chain acceptance.",
  ],
};
writeFileSync(
  new URL("../../../../docs/benchmarks/timelock-opening/domain-audit.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  `${messages.length} message cases and ${wire.length} tlock envelope cases match measured expectations`,
);

// Offline quicknet signature and hash-to-G1 vectors. No HTTP or future beacon lookup.
import { writeFileSync } from "node:fs";
import { bls12_381 as bls } from "@noble/curves/bls12-381";
import { sha256 } from "@noble/hashes/sha256";
import { beacon1000, beacon1001 } from "./opening-fixtures.js";
import { QUICKNET, verifyBeacon } from "./opening.js";
const dst = "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";
const hex = (x: Uint8Array) => Buffer.from(x).toString("hex");
const vector = (name: string, round: number, signature: string, expected: boolean) => {
  const roundBytes = Buffer.alloc(8);
  roundBytes.writeBigUInt64BE(BigInt(round));
  const message = sha256(roundBytes);
  const point = bls.G1.hashToCurve(message, { DST: dst }).toAffine();
  const accepted = verifyBeacon(
    { round, signature, randomness: hex(sha256(Buffer.from(signature, "hex"))) },
    round,
  );
  if (accepted !== expected) throw new Error(`Unexpected classification: ${name}`);
  return {
    name,
    round: String(round),
    signature,
    expected,
    roundBytes: hex(roundBytes),
    message: hex(message),
    hashToG1: { x: String(point.x), y: String(point.y) },
  };
};
const vectors = [
  vector("quicknet-1000", 1000, beacon1000.signature, true),
  vector("quicknet-1001", 1001, beacon1001.signature, true),
  vector("round-1001-with-signature-1000", 1001, beacon1000.signature, false),
  vector("round-1000-with-signature-1001", 1000, beacon1001.signature, false),
  vector(
    "negated-signature",
    1000,
    hex(bls.G1.ProjectivePoint.fromHex(beacon1000.signature).negate().toRawBytes(true)),
    false,
  ),
  vector(
    "unrelated-subgroup-point",
    1000,
    hex(bls.G1.ProjectivePoint.BASE.toRawBytes(true)),
    false,
  ),
  vector("identity-signature", 1000, hex(bls.G1.ProjectivePoint.ZERO.toRawBytes(true)), false),
];
writeFileSync(
  new URL("../../../../docs/benchmarks/timelock-opening/beacon-input.json", import.meta.url),
  JSON.stringify(
    {
      scope: "Quicknet signature authentication only; not complete mission validity",
      publicKey: QUICKNET.public_key,
      chainHash: QUICKNET.hash,
      scheme: QUICKNET.schemeID,
      dst,
      vectors,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `${vectors.length} beacon classifications matched; two native hash-to-G1 vectors exported`,
);

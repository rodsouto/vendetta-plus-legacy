// Cross-language age vectors. Native crypto authenticates independently of the circuit.
import { createDecipheriv, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";
import { keccak256, toHex } from "viem";
import { writeFileSync } from "node:fs";
import { ChaCha20Poly1305 } from "@stablelib/chacha20poly1305";
import { beacon1000, loadOpeningCases } from "./opening-fixtures.js";
import { deriveFileKey, evaluateOpening, openAge, parseEnvelope, sha256Hex } from "./opening.js";
const require = createRequire(import.meta.url);
const { encodeArmor } = require("tlock-js/age/armor") as typeof import("tlock-js/age/armor");
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const source = loadOpeningCases().find((c) => c.name === "valid")!;
const parsed = parseEnvelope(source.ciphertext);
if ("status" in parsed) throw new Error("Invalid fixture");
const envelope = parsed;
const kem = deriveFileKey(envelope, beacon1000);
if ("status" in kem) throw new Error("Invalid capsule");
const nonce = Buffer.alloc(12);
nonce[11] = 1;
const hkdf = (key: Uint8Array, salt: Uint8Array, info: string) =>
  Buffer.from(hkdfSync("sha256", key, salt, info, 32));
function vector(
  name: string,
  header: Uint8Array,
  mac: Uint8Array,
  body: Uint8Array,
  fileKey: Uint8Array,
) {
  const expectedMac = createHmac("sha256", hkdf(fileKey, Buffer.alloc(0), "header"))
    .update(header)
    .digest();
  const headerValid = timingSafeEqual(expectedMac, mac);
  const payloadKey = hkdf(fileKey, body.slice(0, 16), "payload");
  const decipher = createDecipheriv("chacha20-poly1305", payloadKey, nonce, { authTagLength: 16 });
  decipher.setAuthTag(body.slice(-16));
  const rawPlain = decipher.update(body.slice(16, -16));
  let payloadValid = true;
  try {
    if (decipher.final().length !== 0) throw new Error("Unexpected buffered plaintext");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("authenticate")) throw error;
    payloadValid = false;
  }
  const reference = openAge(
    { ...envelope, macInput: Buffer.from(header).toString("utf8"), mac, body },
    fileKey,
  );
  if (headerValid && payloadValid) {
    if (!(reference instanceof Uint8Array) || hex(reference) !== hex(rawPlain))
      throw new Error("Opening disagrees");
  } else if (
    reference instanceof Uint8Array ||
    reference.status !== "invalid" ||
    reference.reason !== (headerValid ? "payload-authentication" : "header-authentication")
  )
    throw new Error("Authentication classification disagrees");
  const raw = Buffer.concat([
    Buffer.from(header),
    Buffer.from(" " + Buffer.from(mac).toString("base64").replace(/=+$/, "") + "\n"),
    Buffer.from(body),
  ]);
  const armored = encodeArmor(raw.toString("binary"));
  if (name === "archived-client" && armored !== source.ciphertext)
    throw new Error("Canonical armor differs from archived client");
  return {
    name,
    ciphertextHash: keccak256(toHex(armored)),
    header: hex(header),
    mac: hex(mac),
    body: hex(body),
    fileKey: hex(fileKey),
    rawPlain: hex(rawPlain),
    headerValid,
    payloadValid,
  };
}
const header = Buffer.from(envelope.macInput);
const vectors = [vector("archived-client", header, envelope.mac, envelope.body, kem.fileKey)];
const flip = (a: Uint8Array, index = 0) => {
  const b = Buffer.from(a);
  b[index] = b[index]! ^ 1;
  return b;
};
vectors.push(vector("changed-header", flip(header), envelope.mac, envelope.body, kem.fileKey));
vectors.push(vector("changed-header-mac", header, flip(envelope.mac), envelope.body, kem.fileKey));
vectors.push(
  vector("changed-ciphertext", header, envelope.mac, flip(envelope.body, 16), kem.fileKey),
);
vectors.push(
  vector(
    "changed-payload-tag",
    header,
    envelope.mac,
    flip(envelope.body, envelope.body.length - 1),
    kem.fileKey,
  ),
);
vectors.push(vector("changed-salt", header, envelope.mac, flip(envelope.body), kem.fileKey));
vectors.push(vector("changed-file-key", header, envelope.mac, envelope.body, flip(kem.fileKey)));
for (const size of [0, 1, 15, 16, 17, 63, 64, 65, 95, 128, 256]) {
  const plain = Uint8Array.from({ length: size }, (_, i) => (i * 37 + size) % 256);
  const salt = Buffer.from(sha256Hex(`age-salt-${size}`), "hex").slice(0, 16);
  const sealed = new ChaCha20Poly1305(hkdf(kem.fileKey, salt, "payload")).seal(nonce, plain);
  vectors.push(
    vector(
      `payload-length-${size}`,
      header,
      envelope.mac,
      Buffer.concat([salt, sealed]),
      kem.fileKey,
    ),
  );
}
writeFileSync(
  new URL("../../../../docs/benchmarks/timelock-opening/age-input.json", import.meta.url),
  JSON.stringify(
    {
      scope:
        "age/v1 one final STREAM chunk, pre-parsed header/body; no beacon, capsule or mission authentication",
      sourceCiphertextHash: source.context.ciphertextHash,
      vectors,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `${vectors.length} age vectors; header ${header.length} bytes; native crypto agrees with reference opening`,
);

// Demonstrates the remaining authentication boundary: a subgroup point is not a drand beacon.
const { bls12_381: bls } = await import("@noble/curves/bls12-381");
const { fp12ToBytes } = require("tlock-js/crypto/utils") as typeof import("tlock-js/crypto/utils");
const { verifyBeacon } = await import("./opening.js");
const forgedSignature = bls.G1.ProjectivePoint.fromHex(beacon1000.signature)
  .negate()
  .toRawBytes(true);
const gt = bls.pairing(
  bls.G1.ProjectivePoint.fromHex(forgedSignature),
  bls.G2.ProjectivePoint.fromHex(envelope.u),
);
const h2 = Buffer.from(sha256Hex(Buffer.concat([Buffer.from("IBE-H2"), fp12ToBytes(gt)])), "hex");
const sigma = Buffer.from(envelope.v.map((b, i) => b ^ h2[i]!));
const h4 = Buffer.from(sha256Hex(Buffer.concat([Buffer.from("IBE-H4"), sigma])), "hex");
const forgedKey = Buffer.from(envelope.w.map((b, i) => b ^ h4[i]!));
const forgedBeacon = {
  ...beacon1000,
  signature: hex(forgedSignature),
  randomness: sha256Hex(forgedSignature),
};
const fakeKEM = deriveFileKey(envelope, forgedBeacon);
if (!("status" in fakeKEM) || fakeKEM.status !== "invalid" || fakeKEM.reason !== "capsule-rp-check")
  throw new Error("Unexpected forged KEM classification");
if (verifyBeacon(forgedBeacon, 1000))
  throw new Error("Forged signature unexpectedly authenticates");
const capsule = Buffer.concat([envelope.u, envelope.v, envelope.w]);
const referenceBoundary = evaluateOpening(
  source.ciphertext,
  source.context,
  forgedBeacon,
  BigInt(source.now),
).result;
if (
  referenceBoundary.status !== "untrusted" ||
  referenceBoundary.reason !== "unauthenticated-beacon"
)
  throw new Error("Reference must reject the forged beacon as untrusted");
const forgedAge = vector(
  "unauthenticated-signature",
  header,
  envelope.mac,
  envelope.body,
  forgedKey,
);
if (
  forgedAge.ciphertextHash !== source.context.ciphertextHash ||
  forgedAge.headerValid ||
  forgedAge.payloadValid
)
  throw new Error("Unexpected boundary regression");
writeFileSync(
  new URL(
    "../../../../docs/benchmarks/timelock-opening/age-unauthenticated-input.json",
    import.meta.url,
  ),
  JSON.stringify(
    {
      scope:
        "Regression for missing beacon authentication; this is not a mission invalidity certificate",
      beaconAuthenticated: false,
      referenceStatus: referenceBoundary.status,
      referenceReason: referenceBoundary.reason,
      signature: hex(forgedSignature),
      capsule: hex(capsule),
      fileKey: hex(forgedKey),
      capsuleValid: false,
      age: forgedAge,
    },
    null,
    2,
  ) + "\n",
);
console.log("Unauthenticated-signature boundary archived; original mission ciphertext unchanged");

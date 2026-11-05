// Deterministic, offline fixtures. Keys below belong to archived research vectors only.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { timelockDecrypt } from "tlock-js";
import { keccak256, toHex } from "viem";
import { sim, encodeHiddenPlain } from "@vendetta/rules";
import {
  decodePlainV2,
  decodePacketV2,
  encodePlainV2,
  headerV2,
  packetV2ToArmor,
  sealPacketV2,
} from "./codec-v2.js";
import { validatePlain, type Context } from "./opening.js";
import { offlineClient } from "./opening-fixtures.js";
const dir = new URL("../../../../docs/benchmarks/timelock-opening/", import.meta.url);
const original = JSON.parse(readFileSync(new URL("capsule-input.json", dir), "utf8"))
  .vectors[0] as {
  signature: string;
  capsule: string;
  fileKey: string;
  capsuleValid: boolean;
  iterations: number;
};
const five = JSON.parse(
  readFileSync(new URL("capsule-bound-input.json", dir), "utf8"),
) as typeof original;
const values = [
  { name: "valid", kind: 1, city: 1n, neighborhood: 1n, slot: 2n, salt: 5n },
  { name: "valid-five-candidates", kind: 1, city: 1n, neighborhood: 1n, slot: 2n, salt: 5n },
  { name: "max-salt", kind: 1, city: 1n, neighborhood: 1n, slot: 2n, salt: (1n << 256n) - 1n },
  { name: "kind-out-of-domain", kind: 255, city: 1n, neighborhood: 1n, slot: 2n, salt: 5n },
  { name: "city-out-of-map", kind: 1, city: 51n, neighborhood: 1n, slot: 2n, salt: 5n },
];
const baseline = JSON.parse(readFileSync(new URL("mission-input.json", dir), "utf8"))
  .vectors[0] as { context: Context; abi: string };
const vectors = [];
for (const v of [
  ...values,
  ...["wrong-commitment", "bad-header-mac", "bad-payload-tag", "unknown-plain-version"].map(
    (name) => ({ ...values[0]!, name }),
  ),
]) {
  const plain = {
    kind: v.kind,
    target: { city: v.city, neighborhood: v.neighborhood, slot: v.slot },
    salt: v.salt,
  };
  const source = v.name === "valid-five-candidates" ? five : original;
  const key = Buffer.from(source.fileKey, "hex"),
    capsule = Buffer.from(source.capsule, "hex");
  const raw = encodePlainV2(plain);
  if (v.name === "unknown-plain-version") raw[0] = 3;
  const payloadSalt = createHash("sha256")
    .update("codec-v2-fixture-" + v.name)
    .digest()
    .subarray(0, 16);
  const packet = sealPacketV2(1000n, capsule, key, raw, payloadSalt);
  if (v.name === "bad-header-mac") packet[172] = packet[172]! ^ 1;
  if (v.name === "bad-payload-tag") packet[272] = packet[272]! ^ 1;
  const parsed = decodePacketV2(packet)!;
  const armor = packetV2ToArmor(packet);
  const context = {
    ...structuredClone(baseline.context),
    ciphertextHash: keccak256(toHex(packet)),
    commitment:
      v.name === "wrong-commitment"
        ? "0x" + "00".repeat(32)
        : sim.hiddenCommit(1n, v.kind, plain.target, v.salt),
  };
  const abi = Buffer.from(baseline.abi.slice(2), "hex");
  abi.set(Buffer.from(keccak256(toHex("VENDETTA_OPENING_V2")).slice(2), "hex"), 0);
  abi.set(Buffer.from(context.commitment.slice(2), "hex"), 32 * 18);
  abi.set(Buffer.from(context.ciphertextHash.slice(2), "hex"), 32 * 19);
  const semantic = validatePlain(Buffer.from(encodeHiddenPlain(plain)), context);

  const expectDecrypt = v.name !== "bad-header-mac" && v.name !== "bad-payload-tag";
  const expected =
    expectDecrypt && v.name !== "unknown-plain-version" && semantic.status === "valid";
  let decrypted: Uint8Array | undefined;
  try {
    decrypted = await timelockDecrypt(armor, offlineClient);
  } catch (error) {
    if (expectDecrypt) throw error;
  }
  if (!expectDecrypt && decrypted) throw new Error("Native accepted damaged authentication");
  if (!decrypted) decrypted = raw;
  if (!Buffer.from(decrypted).equals(raw)) throw new Error("Native decrypt differs");
  const decoded = decodePlainV2(decrypted)!;
  if (v.name !== "unknown-plain-version" && decoded?.salt !== plain.salt)
    throw new Error("Salt lost bits");
  vectors.push({
    name: v.name,
    context,
    abi: "0x" + abi.toString("hex"),
    statement: keccak256(toHex(abi)),
    expected: expected ? "valid" : "invalid",
    headerValid: v.name !== "bad-header-mac",
    payloadValid: v.name !== "bad-payload-tag",
    packet: packet.toString("hex"),
    packetHash: keccak256(toHex(packet)),
    header: headerV2(1000n, capsule).toString("hex"),
    mac: Buffer.from(parsed.mac).toString("hex"),
    body: Buffer.from(parsed.body).toString("hex"),
    fileKey: source.fileKey,
    signature: source.signature,
    capsule: source.capsule,
    capsuleValid: true,
    iterations: source.iterations,
    rawPlain: raw.toString("hex"),
    jsonPlain: encodeHiddenPlain(plain),
    kind: v.kind,
    decimals: [v.city, v.neighborhood, v.slot, v.salt].map(String),
    commitment: sim.hiddenCommit(1n, v.kind, plain.target, v.salt),
    nativeInteroperability: true,
  });
}
mkdirSync(new URL("codec-v2/", dir), { recursive: true });
writeFileSync(
  new URL("codec-v2/vectors.json", dir),
  JSON.stringify(
    {
      scope: "Fixed future codec research; native tlock interoperability, no production admission",
      plainBytes: 37,
      packetBytes: 273,
      headerBytes: Buffer.from(vectors[0]!.header, "hex").length,
      vectors,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Exported ${vectors.length} deterministic codec v2 vectors`);

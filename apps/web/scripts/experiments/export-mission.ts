import { createRequire } from "node:module";
import { hkdfSync } from "node:crypto";
import { ChaCha20Poly1305 } from "@stablelib/chacha20poly1305";
import { timelockDecrypt } from "tlock-js";
// Canonical message/context vectors, cross-checked against the existing reference predicate.
import { readFileSync, writeFileSync } from "node:fs";
import { encodeAbiParameters, keccak256, toHex, type Address, type Hex } from "viem";
import { encodeHiddenPlain, gameConfig, sim, vendetta, type HiddenPlain } from "@vendetta/rules";
import { beacon1000, offlineClient, loadOpeningCases } from "./opening-fixtures.js";
import {
  QUICKNET,
  RULES_DIGEST,
  statementDigest,
  validatePlain,
  evaluateOpening,
  sha256Hex,
  type Context,
} from "./opening.js";
const base = loadOpeningCases().find((c) => c.name === "valid")!;
const original: HiddenPlain = {
  kind: 1,
  target: { city: 1n, neighborhood: 1n, slot: 2n },
  salt: 5n,
};
const fr = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
function contextAbi(c: Context) {
  return encodeAbiParameters(
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
      BigInt(c.chainId),
      c.game as Address,
      BigInt(c.mission),
      keccak256(
        encodeAbiParameters(
          [{ type: "bytes32" }, { type: "bytes32" }],
          [keccak256(toHex(c.ruleset)), RULES_DIGEST],
        ),
      ),
      BigInt(c.owner),
      [BigInt(c.from.city), BigInt(c.from.neighborhood), BigInt(c.from.slot)],
      BigInt(c.cover),
      c.cargo.map(BigInt) as [bigint, bigint, bigint, bigint],
      BigInt(c.arrival),
      BigInt(c.round),
      ("0x" + QUICKNET.hash) as Hex,
      keccak256(("0x" + QUICKNET.public_key) as Hex),
      c.commitment as Hex,
      c.ciphertextHash as Hex,
    ],
  );
}
const vectors: unknown[] = [];
function add(
  name: string,
  message: HiddenPlain = original,
  patch: Partial<Context> = {},
  options: { commit?: boolean; raw?: string; profile?: "unsupported" | "unsupported-context" } = {},
) {
  const context = { ...structuredClone(base.context), ...patch };
  if (options.commit !== false)
    context.commitment = sim.hiddenCommit(
      BigInt(context.owner),
      message.kind,
      message.target,
      message.salt,
    );
  const plain = options.raw ?? encodeHiddenPlain(message);
  const expected = validatePlain(Buffer.from(plain), context);
  const abi = contextAbi(context),
    statement = statementDigest(context);
  if (keccak256(abi) !== statement) throw new Error(`Context ABI differs from reference: ${name}`);
  vectors.push({
    name,
    context,
    abi,
    statement,
    plain: Buffer.from(plain).toString("hex"),
    kind: message.kind,
    decimals: [
      message.target.city,
      message.target.neighborhood,
      message.target.slot,
      message.salt,
    ].map(String),
    expected: expected.status,
    expectedReason: expected.status === "valid" ? null : expected.reason,
    profile: options.profile ?? "canonical",
  });
}
add("archived-client");
add("wrong-commitment", original, { commitment: "0x" + "00".repeat(32) }, { commit: false });
add("wrong-owner", original, { owner: "2" }, { commit: false });
add("origin-is-target", { ...original, target: { city: 1n, neighborhood: 1n, slot: 1n } });
add("city-out-of-map", { ...original, target: { city: 51n, neighborhood: 1n, slot: 2n } });
add("neighborhood-out-of-map", { ...original, target: { city: 1n, neighborhood: 51n, slot: 2n } });
add("slot-out-of-map", { ...original, target: { city: 1n, neighborhood: 1n, slot: 256n } });
add(
  "rounded-diagonal-fits-cover-one",
  { ...original, target: { city: 1n, neighborhood: 1n, slot: 19n } },
  { cover: "1" },
);
add(
  "next-rounded-distance-exceeds-cover-one",
  { ...original, target: { city: 1n, neighborhood: 1n, slot: 20n } },
  { cover: "1" },
);
add(
  "farthest-corner",
  { ...original, target: { city: 50n, neighborhood: 50n, slot: 255n } },
  { cover: "1132" },
);
add("attack-with-cargo", original, { cargo: ["1", "0", "0", "0"] });
add("transport-with-cargo", { ...original, kind: 3 }, { cargo: ["1", "0", "0", "0"] });
add("kind-zero", { ...original, kind: 0 });
add("kind-five", { ...original, kind: 5 });
add("max-uint256-salt", { ...original, salt: (1n << 256n) - 1n });
add("salt-overflow", { ...original, salt: 1n << 256n }, {}, { commit: false });
add("salt-field-alias-must-not-match", { ...original, salt: fr + 5n }, {}, { commit: false });
add("owner-above-proof-field", original, { owner: String(fr + 1n) });
add("target-max-uint256", {
  ...original,
  target: { city: 1n, neighborhood: 1n, slot: (1n << 256n) - 1n },
});
add("cargo-field-alias-is-not-zero", original, { cargo: [String(fr), "0", "0", "0"] });
add("large-cover", original, { cover: String((1n << 256n) - 1n) });
add(
  "legacy-extra-json-element",
  original,
  {},
  { raw: encodeHiddenPlain(original).replace(/]$/, ',"legacy"]'), profile: "unsupported" },
);
add(
  "legacy-leading-zero-coordinate",
  original,
  {},
  { raw: '[1,"01","1","2","5"]', profile: "unsupported" },
);
add(
  "wrong-arrival",
  original,
  { arrival: String(BigInt(base.context.arrival) + 1n) },
  { profile: "unsupported-context" },
);
add("salt-above-field-with-matching-commit", { ...original, salt: fr + 5n });
add(
  "coordinate-overflow-must-not-reduce",
  { ...original, target: { city: 1n, neighborhood: 1n, slot: (1n << 256n) + 255n } },
  {
    cover: "22",
    commitment: sim.hiddenCommit(1n, 1, { city: 1n, neighborhood: 1n, slot: 255n }, 5n),
  },
  { commit: false },
);
const metadata = {
  scope:
    "Canonical message predicate plus context binding only; no new Groth16 proof or production integration",
  rulesDigest: RULES_DIGEST,
  rulesetLabel: base.context.ruleset,
  world: {
    cities: String(vendetta.config.cities),
    neighborhoods: String(vendetta.config.neighborhoods),
    slots: String(vendetta.config.slots),
    gridColumns: String(vendetta.config.gridColumns),
    gridRows: String(vendetta.config.gridRows),
  },
  protocol: { genesis: QUICKNET.genesis_time, period: QUICKNET.period, headStart: 15 },
  gameConfigWorld: gameConfig.world,
};
writeFileSync(
  new URL("../../../../docs/benchmarks/timelock-opening/mission-input.json", import.meta.url),
  JSON.stringify({ ...metadata, vectors }, null, 2) + "\n",
);
console.log(`${vectors.length} mission vectors; context ABI matches reference digest`);
console.log(`Pinned rules digest: ${RULES_DIGEST}`);

const require = createRequire(import.meta.url);
const { encodeArmor } = require("tlock-js/age/armor") as typeof import("tlock-js/age/armor");
const ageBase = (
  JSON.parse(
    readFileSync(
      new URL("../../../../docs/benchmarks/timelock-opening/age-input.json", import.meta.url),
      "utf8",
    ),
  ) as { vectors: { header: string; mac: string; fileKey: string }[] }
).vectors[0]!;
type Case = {
  name: string;
  context: Context;
  abi: string;
  statement: string;
  plain: string;
  kind: number;
  decimals: string[];
  expected: string;
  profile: string;
};
const cases = vectors as Case[];
const encrypted = [];
for (const name of [
  "transport-with-cargo",
  "origin-is-target",
  "attack-with-cargo",
  "max-uint256-salt",
]) {
  const selected = cases.find((v) => v.name === name)!;
  const salt = Buffer.from(sha256Hex(`mission-salt-${name}`), "hex").slice(0, 16);
  const fileKey = Buffer.from(ageBase.fileKey, "hex");
  const key = Buffer.from(hkdfSync("sha256", fileKey, salt, "payload", 32));
  const nonce = Buffer.alloc(12);
  nonce[11] = 1;
  const body = Buffer.concat([
    salt,
    new ChaCha20Poly1305(key).seal(nonce, Buffer.from(selected.plain, "hex")),
  ]);
  const raw = Buffer.concat([
    Buffer.from(ageBase.header, "hex"),
    Buffer.from(" " + Buffer.from(ageBase.mac, "hex").toString("base64").replace(/=+$/, "") + "\n"),
    body,
  ]);
  const ciphertext = encodeArmor(raw.toString("binary"));
  const context = { ...selected.context, ciphertextHash: keccak256(toHex(ciphertext)) };
  const abi = contextAbi(context),
    statement = statementDigest(context);
  if (keccak256(abi) !== statement) throw new Error("Encrypted context mismatch");
  const opened = await timelockDecrypt(ciphertext, offlineClient);
  if (opened.toString("hex") !== selected.plain)
    throw new Error("tlock-js decrypted different message");
  const evaluated = evaluateOpening(ciphertext, context, beacon1000, BigInt(base.now));
  if (evaluated.result.status !== selected.expected)
    throw new Error(`Full opening disagrees on ${name}`);
  encrypted.push({
    mission: { ...selected, context, abi, statement },
    age: {
      name,
      ciphertextHash: context.ciphertextHash,
      header: ageBase.header,
      mac: ageBase.mac,
      fileKey: ageBase.fileKey,
      body: body.toString("hex"),
      rawPlain: selected.plain,
      headerValid: true,
      payloadValid: true,
    },
    libraryInteroperability: true,
    expected: evaluated.result.status,
  });
}
// Also bind damaged ciphertext to its own stored hash, without requiring its raw bytes to parse.
const damaged = (
  JSON.parse(
    readFileSync(
      new URL("../../../../docs/benchmarks/timelock-opening/age-input.json", import.meta.url),
      "utf8",
    ),
  ) as { vectors: { name: string; ciphertextHash: string }[] }
).vectors[3]!;
const damagedContext = { ...base.context, ciphertextHash: damaged.ciphertextHash };
const damagedMission = {
  ...cases[0]!,
  name: "authenticated-crypto-failure",
  context: damagedContext,
  abi: contextAbi(damagedContext),
  statement: statementDigest(damagedContext),
  expected: "invalid",
};
writeFileSync(
  new URL(
    "../../../../docs/benchmarks/timelock-opening/mission-encrypted-input.json",
    import.meta.url,
  ),
  JSON.stringify(
    {
      scope:
        "Synthetic ciphertexts using archived capsule/key and fresh deterministic payload salts, checked with tlock-js; no production sends",
      encrypted,
      damagedMission,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `${encrypted.length} complete encrypted message vectors match tlock-js and reference; crypto-failure context exported`,
);

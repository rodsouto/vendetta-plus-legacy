import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { timelockEncrypt, Buffer, defaultChainInfo, type ChainClient } from "tlock-js";
import { encodeHiddenPlain, sim, type HiddenPlain } from "@vendetta/rules";
import { keccak256, toHex } from "viem";
import { QUICKNET, type Beacon, type Context, type OpeningResult } from "./opening.js";

const require = createRequire(import.meta.url);
const { decodeArmor, encodeArmor } =
  require("tlock-js/age/armor") as typeof import("tlock-js/age/armor");
const { readAge } =
  require("tlock-js/age/age-reader-writer") as typeof import("tlock-js/age/age-reader-writer");
export const fixtureDirectory = fileURLToPath(
  new URL("../../../../docs/benchmarks/timelock-opening/fixtures/", import.meta.url),
);
export const beacon1000: Beacon = JSON.parse(
  readFileSync(fixtureDirectory + "quicknet-1000.json", "utf8"),
);
export const beacon1001: Beacon = JSON.parse(
  readFileSync(fixtureDirectory + "quicknet-1001.json", "utf8"),
);

export const offlineClient: ChainClient = {
  options: { disableBeaconVerification: false, noCache: true },
  chain: () => ({ baseUrl: "offline://pinned-quicknet", info: async () => defaultChainInfo }),
  get: async (round: number) => {
    if (round === 1000) return beacon1000;
    if (round === 1001) return beacon1001;
    throw new Error("Offline fixture does not contain this round");
  },
  latest: async () => beacon1001,
};

export interface OpeningCase {
  name: string;
  ciphertext: string;
  context: Context;
  beacon: Beacon | null;
  now: string;
  expected: OpeningResult["status"];
  expectedReason?: string;
}
export const loadOpeningCases = (): OpeningCase[] =>
  JSON.parse(readFileSync(fixtureDirectory + "cases.json", "utf8"));

export async function generateOpeningCases() {
  const plain: HiddenPlain = {
    kind: sim.ATTACK,
    target: { city: 1n, neighborhood: 1n, slot: 2n },
    salt: 5n,
  };
  const ciphertext = await timelockEncrypt(
    1000,
    Buffer.from(encodeHiddenPlain(plain)),
    offlineClient,
  );
  const opens = BigInt(QUICKNET.genesis_time) + 999n * BigInt(QUICKNET.period);
  const base: Context = {
    chainId: "100",
    game: "0x1111111111111111111111111111111111111111",
    mission: "1",
    ruleset: "vendetta-opening-research-v1",
    owner: "1",
    from: { city: "1", neighborhood: "1", slot: "1" },
    cover: "2",
    cargo: ["0", "0", "0", "0"],
    arrival: String(opens - 15n),
    round: 1000,
    commitment: sim.hiddenCommit(1n, plain.kind, plain.target, plain.salt),
    ciphertextHash: keccak256(toHex(ciphertext)),
  };
  const cases: OpeningCase[] = [];
  const add = (
    name: string,
    expected: OpeningResult["status"],
    cipher = ciphertext,
    patch: Partial<Context> = {},
    beacon: Beacon | null = beacon1000,
    now = opens + 3600n,
    reason?: string,
  ) => {
    cases.push({
      name,
      expected,
      ciphertext: cipher,
      context: { ...base, ciphertextHash: keccak256(toHex(cipher)), ...patch },
      beacon,
      now: String(now),
      ...(reason ? { expectedReason: reason } : {}),
    });
  };
  const mutate = (fn: (raw: string) => string) => encodeArmor(fn(decodeArmor(ciphertext)));
  add("valid", "valid");
  add("valid-after-long-outage", "valid", ciphertext, {}, beacon1000, opens + 86400n);
  add("round-not-yet-open", "wait", ciphertext, {}, beacon1000, opens - 1n, "round-not-open-yet");
  add("drand-unavailable", "wait", ciphertext, {}, null, opens + 86400n, "beacon-unavailable");
  add(
    "wrong-commitment",
    "invalid",
    ciphertext,
    { commitment: "0x" + "00".repeat(32) },
    beacon1000,
    undefined,
    "commitment-mismatch",
  );
  add(
    "cargo-forbidden-for-attack",
    "invalid",
    ciphertext,
    { cargo: ["1", "0", "0", "0"] },
    beacon1000,
    undefined,
    "message-cargo",
  );
  add(
    "substituted-ciphertext",
    "untrusted",
    ciphertext + " ",
    { ciphertextHash: base.ciphertextHash },
    beacon1000,
    undefined,
    "ciphertext-hash-mismatch",
  );
  add(
    "forged-beacon-round",
    "untrusted",
    ciphertext,
    {},
    { ...beacon1001, round: 1000 },
    undefined,
    "unauthenticated-beacon",
  );
  add(
    "wrong-beacon-round",
    "untrusted",
    ciphertext,
    {},
    beacon1001,
    undefined,
    "unauthenticated-beacon",
  );
  add(
    "wrong-randomness",
    "untrusted",
    ciphertext,
    {},
    { ...beacon1000, randomness: "00".repeat(32) },
    undefined,
    "unauthenticated-beacon",
  );
  add(
    "malformed-age",
    "invalid",
    "this is not age",
    {},
    beacon1000,
    undefined,
    "malformed-age-envelope",
  );
  add(
    "unknown-age-version",
    "unsupported",
    mutate((raw) => raw.replace("age-encryption.org/v1", "age-encryption.org/v2")),
    {},
    beacon1000,
    undefined,
    "age-version",
  );
  add(
    "different-network",
    "unsupported",
    mutate((raw) => raw.replace(QUICKNET.hash, "00".repeat(32))),
    {},
    beacon1000,
    undefined,
    "different-drand-network",
  );
  add(
    "noncanonical-round-encoding",
    "unsupported",
    mutate((raw) => raw.replace("tlock 1000 ", "tlock 01000 ")),
    {},
    beacon1000,
    undefined,
    "round-encoding",
  );
  add(
    "header-mac-corrupted",
    "invalid",
    mutate((raw) => {
      const i = raw.indexOf("--- ") + 4;
      return raw.slice(0, i) + (raw[i] === "A" ? "B" : "A") + raw.slice(i + 1);
    }),
    {},
    beacon1000,
    undefined,
    "header-authentication",
  );
  add(
    "payload-tag-corrupted",
    "invalid",
    mutate((raw) => raw.slice(0, -1) + String.fromCharCode(raw.charCodeAt(raw.length - 1) ^ 1)),
    {},
    beacon1000,
    undefined,
    "payload-authentication",
  );
  add(
    "truncated-payload",
    "invalid",
    mutate((raw) => raw.slice(0, raw.indexOf("\n", raw.indexOf("--- ")) + 1) + "short"),
    {},
    beacon1000,
    undefined,
    "truncated-body",
  );
  add(
    "capsule-corrupted",
    "invalid",
    mutate((raw) => {
      const stanza = readAge(raw).header.recipients[0]!;
      const altered = new Uint8Array(stanza.body);
      altered[96] = altered[96]! ^ 1;
      const lines = (v: Uint8Array) =>
        Buffer.from(v)
          .toString("base64")
          .replace(/=+$/, "")
          .match(/.{1,64}/g)!
          .join("\n");
      return raw.replace(lines(stanza.body), lines(altered));
    }),
    {},
    beacon1000,
    undefined,
    "capsule-rp-check",
  );
  for (const [name, text, p, reason] of [
    ["invalid-message", "not json", plain, "message-decoding"],
    [
      "coordinates-outside-map",
      encodeHiddenPlain({ ...plain, target: { city: 51n, neighborhood: 1n, slot: 2n } }),
      { ...plain, target: { city: 51n, neighborhood: 1n, slot: 2n } },
      "message-target",
    ],
    [
      "distance-outside-cover",
      encodeHiddenPlain({ ...plain, target: { city: 1n, neighborhood: 1n, slot: 17n } }),
      { ...plain, target: { city: 1n, neighborhood: 1n, slot: 17n } },
      "message-cover",
    ],
    ["legacy-decoder-extra-element", '[1,1,1,2,5,"ignored"]', plain, undefined],
  ] as const) {
    const cipher = await timelockEncrypt(1000, Buffer.from(text), offlineClient);
    add(
      name,
      reason ? "invalid" : "valid",
      cipher,
      { commitment: sim.hiddenCommit(1n, p.kind, p.target, p.salt) },
      beacon1000,
      undefined,
      reason,
    );
  }
  const future = await timelockEncrypt(1001, Buffer.from(encodeHiddenPlain(plain)), offlineClient);
  add(
    "ciphertext-for-wrong-future-round",
    "unsupported",
    future,
    {},
    beacon1000,
    undefined,
    "ciphertext-round-profile",
  );
  add(
    "valid-future-ciphertext-must-wait",
    "wait",
    future,
    { round: 1001, arrival: String(opens - 12n) },
    null,
    opens + 1n,
    "round-not-open-yet",
  );
  writeFileSync(fixtureDirectory + "cases.json", JSON.stringify(cases, null, 2) + "\n");
  console.log(`Wrote ${cases.length} offline opening cases`);
}

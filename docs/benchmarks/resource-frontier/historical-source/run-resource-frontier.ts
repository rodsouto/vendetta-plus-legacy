import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { runHistory, type HistoryOptions } from "./frontier-histories.js";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const configs: HistoryOptions[] = [];
for (const occupation of [false, true])
  for (const delay of [0n, 20n, 300n, 7200n]) {
    for (let seed = 1; seed <= 64; seed++) configs.push({ seed, delay, occupation });
  }
for (const occupation of [false, true])
  for (let seed = 1; seed <= 8; seed++)
    configs.push({ seed, occupation, delay: 7200n, permanent: true });
const histories = configs.map(runHistory);
const finite = histories.filter((h) => !h.permanent);
const blocks = new Map<string, number>();
const actionTypes = new Map<string, { accepted: number; reverted: number; blocked: number }>();
for (const h of finite)
  for (const t of h.trace) {
    const counts = actionTypes.get(t.action.type) ?? { accepted: 0, reverted: 0, blocked: 0 };
    counts[t.result.status]++;
    actionTypes.set(t.action.type, counts);
    if (t.result.resource) {
      const category = t.result.resource.split(":")[0]!;
      blocks.set(category, (blocks.get(category) ?? 0) + 1);
    }
  }
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(join(dir, entry.name))
      : entry.name.endsWith(".ts")
        ? [relative(root, join(dir, entry.name))]
        : [],
  );
const files = [
  ...sourceFiles(join(root, "packages/rules/src")),
  ...["resource-frontier", "frontier-histories", "run-resource-frontier"].map(
    (name) => `packages/rules/scripts/experiments/${name}.ts`,
  ),
  "packages/spec-data/generated/game_config.json",
  "packages/spec-data/generated/vendetta.json",
  "pnpm-lock.yaml",
];
const summary = {
  finiteHistories: finite.length,
  exactWorldMatches: finite.filter((h) => h.equal).length,
  exactReceiptMatches: finite.filter((h) => h.receiptsEqual).length,
  permanentHistories: histories.length - finite.length,
  attemptedActions: finite.reduce((s, h) => s + h.trace.length, 0),
  accepted: finite.reduce((s, h) => s + h.accepted, 0),
  reverted: finite.reduce((s, h) => s + h.reverted, 0),
  blocked: finite.reduce((s, h) => s + h.blocked, 0),
  allocatorBlocked: finite.reduce((s, h) => s + h.allocatorBlocked, 0),
  rootsResolvedAfterCurrentGrace: finite.reduce((s, h) => s + h.lateRootExecutions, 0),
  historiesWithAppliedTradePayment: finite.filter((h) => h.tradePaymentApplied).length,
  blockingCategories: Object.fromEntries(blocks),
  actionTypes: Object.fromEntries(actionTypes),
};
const output = join(root, "docs/benchmarks/resource-frontier");
mkdirSync(output, { recursive: true });
const encode = (x: unknown) =>
  JSON.stringify(x, (_, v: unknown) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n";
writeFileSync(
  join(output, "results.json"),
  encode({
    schema: 1,
    nodeVersion: process.version,
    scope:
      "Experimental TS resource frontier; original allocators; ideal evidence ingress; legal preparation; no cryptographic proof or Solidity implementation",
    sourceHashes: Object.fromEntries(
      files.sort().map((file) => [
        file,
        createHash("sha256")
          .update(readFileSync(join(root, file)))
          .digest("hex"),
      ]),
    ),
    summary,
    histories: histories.map(({ trace, execution, ...h }) => h),
  }),
);
writeFileSync(
  join(output, "example-history.json"),
  encode(histories.find((h) => h.seed === 1 && h.delay === 7200n && h.occupation)),
);
console.log(encode(summary));

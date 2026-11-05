import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Hex } from "viem";
import { certificateProducer } from "./prover/service.js";
const [file] = process.argv.slice(2);
if (!file) throw new Error("usage: prover.ts deployment.json");
const deployment = JSON.parse(await readFile(file, "utf8"));
const binary = process.env.HIDDEN_PROVER_BIN,
  keys = process.env.HIDDEN_PROVER_KEYS,
  cache = process.env.HIDDEN_PROVER_CACHE,
  key = process.env.HIDDEN_H3_PRIVATE_KEY as Hex;
if (!binary || !keys || !cache || !key)
  throw new Error(
    "HIDDEN_PROVER_BIN, HIDDEN_PROVER_KEYS, HIDDEN_PROVER_CACHE and HIDDEN_H3_PRIVATE_KEY are required",
  );
const clientsFile = process.env.HIDDEN_PROVER_CLIENTS_FILE;
if (!clientsFile) throw new Error("HIDDEN_PROVER_CLIENTS_FILE is required");
const producer = await certificateProducer({
  clients: JSON.parse(await readFile(clientsFile, "utf8")),
  jobTimeoutMs:
    process.env.HIDDEN_PROVER_TIMEOUT_MS === undefined
      ? undefined
      : Number(process.env.HIDDEN_PROVER_TIMEOUT_MS),
  cacheLimits: {
    maxBytes:
      process.env.HIDDEN_PROVER_CACHE_MAX_BYTES === undefined
        ? undefined
        : Number(process.env.HIDDEN_PROVER_CACHE_MAX_BYTES),
    maxFiles:
      process.env.HIDDEN_PROVER_CACHE_MAX_FILES === undefined
        ? undefined
        : Number(process.env.HIDDEN_PROVER_CACHE_MAX_FILES),
    maxAgeMs:
      process.env.HIDDEN_PROVER_CACHE_MAX_AGE_MS === undefined
        ? undefined
        : Number(process.env.HIDDEN_PROVER_CACHE_MAX_AGE_MS),
  },
  rpc: process.env.RPC_URL || deployment.rpc,
  chainId: deployment.chainId,
  game: deployment.game,
  binary,
  openingKeys: join(keys, "opening"),
  pointKeys: join(keys, "invalid-point"),
  cache,
  h3Key: key,
  allowUnsafeLocalSetup: process.env.ALLOW_UNSAFE_LOCAL_SETUP === "1",
});
const { server } = producer;
process.once("SIGINT", () => {
  void producer.close().catch(() => {
    process.exitCode = 1;
  });
});
process.once("SIGTERM", () => {
  void producer.close().catch(() => {
    process.exitCode = 1;
  });
});
server.once("error", () => {
  process.exitCode = 1;
  void producer.close().catch(() => {
    process.exitCode = 1;
  });
});
server.listen(Number(process.env.HIDDEN_PROVER_PORT || 8787), "127.0.0.1", () =>
  console.log("Certificate producer listening on loopback"),
);

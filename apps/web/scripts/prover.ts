import { serviceErrorSummary } from "./service-errors.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Hex } from "viem";
import { certificateProducer } from "./prover/service.js";
import { assertServiceStateDirectory } from "./service-state.js";
import { serveProducer } from "./prover/serve.js";
async function main() {
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
  assertServiceStateDirectory(cache);
  const clientsFile = process.env.HIDDEN_PROVER_CLIENTS_FILE;
  if (!clientsFile) throw new Error("HIDDEN_PROVER_CLIENTS_FILE is required");
  await serveProducer(
    async () =>
      certificateProducer({
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
        runtimeFile: process.env.HIDDEN_PROVER_RUNTIME,
        cache,
        h3Key: key,
        allowUnsafeLocalSetup: process.env.ALLOW_UNSAFE_LOCAL_SETUP === "1",
      }),
    Number(process.env.HIDDEN_PROVER_PORT || 8787),
    {
      listening: () => console.log("Certificate producer listening on loopback"),
    },
  );
}
try {
  await main();
} catch (error) {
  console.error("Certificate producer failed:", JSON.stringify(serviceErrorSummary(error)));
  process.exitCode = 1;
}

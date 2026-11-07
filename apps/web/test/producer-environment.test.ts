import { expect, it } from "vitest";
import { producerNativeEnv } from "../scripts/prover/environment.js";
import { runProducer } from "../scripts/prover/jobs.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireStateLease } from "../scripts/state-lease.js";

it("passes only runtime settings to native inspection, including the leased spawn path", async () => {
  const source = {
    PATH: "/usr/bin",
    LANG: "C",
    PROVER_THREADS: "4",
    PROVER_MEMORY: "5GiB",
    GOGC: "25",
    HIDDEN_H3_PRIVATE_KEY: "synthetic-service-key",
    KEEPER_PRIVATE_KEY: "synthetic-keeper-key",
    HIDDEN_PROVER_TOKEN: "synthetic-token",
    DATABASE_URL: "synthetic-db-secret",
    NODE_OPTIONS: "synthetic-not-a-node-option",
    LD_PRELOAD: "synthetic-do-not-load",
  };
  const env = producerNativeEnv(source);
  expect(env).toEqual({
    PATH: "/usr/bin",
    LANG: "C",
    PROVER_THREADS: "4",
    PROVER_MEMORY: "5GiB",
    GOGC: "25",
    GOMAXPROCS: "4",
    GOMEMLIMIT: "5GiB",
  });
  const dir = await mkdtemp(join(tmpdir(), "vendetta-native-env-"));
  const lease = await acquireStateLease(dir);
  try {
    for (const stateLeaseFd of [undefined, lease.fd]) {
      const result = await runProducer(
        process.execPath,
        ["-e", "console.log(JSON.stringify(process.env))"],
        5000,
        { env, stateLeaseFd },
      );
      expect(JSON.parse(result.stdout.toString())).toEqual(env);
    }
  } finally {
    await lease.release();
    await rm(dir, { recursive: true, force: true });
  }
});
it("keeps runtime defaults but strips service and loader settings from explicit overrides", () => {
  expect(
    producerNativeEnv({
      HIDDEN_H3_PRIVATE_KEY: "synthetic-secret",
      NODE_OPTIONS: "synthetic-option",
    }),
  ).toEqual({ GOMAXPROCS: "8", GOMEMLIMIT: "6GiB" });
});

it("treats empty runtime limits as unset instead of disabling defaults", () => {
  expect(producerNativeEnv({ PROVER_THREADS: "  ", PROVER_MEMORY: "" })).toEqual({
    GOMAXPROCS: "8",
    GOMEMLIMIT: "6GiB",
  });
});

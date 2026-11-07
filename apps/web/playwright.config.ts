import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

// Each run starts a fresh chain and app (e2e/serve.sh), so the specs start from an empty
// world (they share it: the ranking also lists the players of earlier specs).
const webPort = Number(process.env.VENDETTA_E2E_WEB_PORT || 5199);
if (!Number.isSafeInteger(webPort) || webPort < 1024 || webPort > 65535)
  throw new Error("Invalid VENDETTA_E2E_WEB_PORT");
const explicitRun = process.env.VENDETTA_E2E_RUN_DIR;
process.env.VENDETTA_E2E_RUN_DIR = explicitRun || join(tmpdir(), "vendetta-e2e-" + randomUUID());
const url = `http://127.0.0.1:${webPort}`;
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  workers: 1,
  use: { baseURL: url, locale: "es-AR" },
  webServer: {
    command: "bash e2e/serve.sh",
    env: {
      VENDETTA_E2E_RUN_DIR: process.env.VENDETTA_E2E_RUN_DIR,
      VENDETTA_E2E_EPHEMERAL: explicitRun ? "0" : "1",
    },
    url,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    timeout: 120_000,
  },
});

import { defineConfig } from "@playwright/test";

// Each run starts a fresh chain, keeper and app (e2e/serve.sh), so the specs start from an empty
// world (they share it: the ranking also lists the players of earlier specs).
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  workers: 1,
  use: { baseURL: "http://localhost:5199", locale: "es-AR" },
  webServer: {
    command: "bash e2e/serve.sh",
    url: "http://localhost:5199",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

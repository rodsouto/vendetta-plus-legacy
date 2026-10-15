import { defineConfig } from "@playwright/test";

// Each run starts a fresh chain and app (e2e/serve.sh), so the flow always starts from an empty world.
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

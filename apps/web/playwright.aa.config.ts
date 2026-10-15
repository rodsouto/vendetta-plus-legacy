import { defineConfig } from "@playwright/test";

// Passkey accounts on the local 4337 stack (scripts/aa-stack.ts: anvil + account contracts + Alto +
// mock paymaster), started fresh for each run on its own ports.
export default defineConfig({
  testDir: "e2e-aa",
  timeout: 180_000,
  workers: 1,
  use: { baseURL: "http://localhost:5198", locale: "es-AR" },
  webServer: {
    command: "tsx scripts/aa-stack.ts --base 8580 --vite 5198",
    url: "http://localhost:5198",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

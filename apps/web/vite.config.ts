/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// .env (secrets, git-ignored) lives at the repo root, shared with scripts/deploy-arbitrum.sh.

export default defineConfig({
  plugins: [react()],
  envDir: "../..",
  // Unit and chain tests; the Playwright e2e suite lives in e2e/ and runs with `pnpm e2e`.
  test: { include: ["test/**/*.test.ts"] },
});

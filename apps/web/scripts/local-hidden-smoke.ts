// Real local startup/browser integration only. Never requests a certificate or native proof.
import assert from "node:assert/strict";
import { readFile, open } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { createPublicClient, http } from "viem";
import { gameAbi } from "../src/chain/abi.js";
import { chromium, expect } from "@playwright/test";
const [run, ...extra] = process.argv.slice(2);
if (!run || !isAbsolute(run) || extra.length)
  throw new Error("Usage: local-hidden-smoke.ts /absolute/running-stack-directory");
const record = await open(join(run, "smoke-result.json"), "wx", 0o600);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const stack = JSON.parse(await readFile(join(run, "stack.json"), "utf8"));
  assert.equal(stack.productionApproved, false);
  assert.equal(stack.deployment.chainId, 31337);
  for (const value of [stack.web, stack.prover, stack.deployment.rpc]) {
    const url = new URL(value);
    assert.equal(url.hostname, "127.0.0.1");
    assert.equal(url.protocol, "http:");
    assert(!url.username && !url.password);
  }
  assert.equal(stack.ephemeral, true);
  const publicClient = createPublicClient({
    transport: http(stack.deployment.rpc, { timeout: 10000, retryCount: 0 }),
    cacheTime: 0,
  });
  const counters = await publicClient.readContract({
    address: stack.deployment.game,
    abi: gameAbi,
    functionName: "counters",
  });
  assert.equal(counters[1], 0n, "Smoke requires an unplayed world; existing players are preserved");
  const clients = JSON.parse(await readFile(join(run, "producer-clients.json"), "utf8"));
  assert.equal((await fetch(stack.prover + "/metrics")).status, 401);
  const metrics = async () => {
    const r = await fetch(stack.prover + "/metrics", {
      headers: { Authorization: "Bearer " + clients[0].token },
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(r.status, 200);
    return r.json();
  };
  const initial = await metrics();
  for (const name of ["requests", "proofs"]) {
    assert.equal(typeof initial.counters?.[name], "number", "Missing producer metric: " + name);
    assert.equal(
      initial.counters[name],
      0,
      "Start smoke only in a fresh stack without certificate jobs",
    );
  }
  const sourceResponse = await fetch(stack.web + "/src/chain/networks.ts");
  assert.equal(
    sourceResponse.status,
    200,
    "Vite network module must load before checking the canary",
  );
  const source = await sourceResponse.text();
  assert(!source.includes("local-secret-canary-only"));
  assert(!source.includes("VITE_UNEXPECTED_BROWSER_SECRET"));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ locale: "es-AR" });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("lang", "es");
    localStorage.setItem("vendetta.guide.seen.v1", "1");
  });
  await page.goto(stack.web + "/#/dev");
  const loaded = await page.evaluate(async () => {
    const module = "/src/chain/networks.ts";
    const { loadNetwork } = await import(module);
    const network = await loadNetwork();
    return { id: network.id, accounts: network.accounts, deployment: network.deployment };
  });
  assert.equal(loaded.id, "local");
  assert.equal(loaded.accounts, "dev");
  assert.equal(loaded.deployment.game, stack.deployment.game);
  assert.equal(loaded.deployment.rpc, stack.deployment.rpc);
  await page.getByRole("button", { name: /^#1 ·/ }).click();
  await page.goto(stack.web + "/#/book");
  await page.getByRole("button", { name: /^25:25:100 / }).click();
  await page.getByRole("button", { name: "Fundar aquí" }).click();
  await expect(page.locator(".stamp-toast")).toContainText("Cuenta abierta", { timeout: 15000 });
  await page
    .getByRole("row", { name: /^Campo de entrenamiento/ })
    .getByRole("button", { name: "Construir" })
    .click();
  await expect(page.locator(".stamp-toast").filter({ hasText: "En cola" })).toBeVisible({
    timeout: 15000,
  });
  for (const [route, title] of [
    ["missions", "Misiones"],
    ["reports", "Informes de batalla"],
    ["ranking", "Ranking"],
  ]) {
    await page.goto(stack.web + "/#/" + route);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  const after = await metrics();
  assert.equal(after.counters.requests, 0);
  assert.equal(after.counters.proofs, 0);
  assert.deepEqual(pageErrors, []);
  await record.writeFile(
    JSON.stringify(
      {
        passed: true,
        runDirectory: run,
        ephemeral: true,
        playersBeforeSmoke: "0",
        chainId: 31337,
        game: stack.deployment.game,
        registrationThroughBrowser: true,
        roomQueuedThroughBrowser: true,
        routes: ["dev", "book", "missions", "reports", "ranking"],
        unauthenticatedMetricsRejected: true,
        authenticatedMetricsPassed: true,
        certificateRequests: after.counters.requests,
        proofs: after.counters.proofs,
        browserCanarySupplied: stack.browserCanarySupplied === true,
        shellViteCanaryAbsent: stack.browserCanarySupplied === true ? true : null,
        nativeProvingExecuted: false,
        productionApproved: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Local browser smoke passed; no certificate/native proof requested");
} catch (error) {
  await record.writeFile(
    JSON.stringify(
      { passed: false, error: (error as Error).message, productionApproved: false },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  await browser?.close();
  await record.close();
}

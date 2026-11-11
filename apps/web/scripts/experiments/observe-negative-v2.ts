// Browser observation only. Reject every browser-originated RPC mutation and producer request.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { chromium, expect } from "@playwright/test";
const [out, label, ...extra] = process.argv.slice(2);
if (!out || !isAbsolute(out) || !label || !/^[a-z0-9-]+$/.test(label) || extra.length)
  throw new Error("Usage: observe-negative-v2.ts /absolute/live-evidence-directory label");
const file = join(out, `browser-${label}.json`);
assert(!existsSync(file));
const stack = JSON.parse(readFileSync(join(out, "session/stack.json"), "utf8"));
assert.equal(stack.ephemeral, true);
assert.equal(stack.productionApproved, false);
const browser = await chromium.launch({ headless: true });
const blocked: string[] = [];
const errors: string[] = [];
try {
  const page = await browser.newPage({ locale: "es-AR", viewport: { width: 1440, height: 1050 } });
  await page.route(stack.deployment.rpc + "/**", async (route) => {
    const body = route.request().postDataJSON();
    const calls = Array.isArray(body) ? body : [body];
    if (calls.some((call) => /^(eth_send|evm_|anvil_|wallet_)/.test(call?.method ?? ""))) {
      blocked.push(...calls.map((call) => call?.method));
      await route.abort();
    } else await route.continue();
  });
  await page.route(stack.prover + "/**", async (route) => {
    blocked.push("producer-request");
    await route.abort();
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("lang", "es");
    localStorage.setItem("vendetta.guide.seen.v1", "1");
  });
  await page.goto(stack.web + "/#/dev");
  await page.getByRole("button", { name: /· 0xf39F/i }).click();
  await page.goto(stack.web + "/#/missions");
  await expect(page.getByRole("heading", { name: "Misiones", exact: true })).toBeVisible();
  await page.screenshot({ path: join(out, `browser-${label}.png`), fullPage: true });
  writeFileSync(
    file,
    JSON.stringify(
      {
        mode: "observation only",
        submittedMissions: false,
        label,
        url: page.url(),
        observedAt: new Date().toISOString(),
        blocked,
        errors,
        text: await page.locator("body").innerText(),
      },
      null,
      2,
    ) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  assert.deepEqual(blocked, []);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}

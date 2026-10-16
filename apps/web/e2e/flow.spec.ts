// Main flow on a local chain: two players register, one builds, trains, attacks the other and reads
// the battle report. Also captures the review screenshots (desktop and mobile).
import { expect, test, type Page } from "@playwright/test";

const stamp = (page: Page) => page.locator(".stamp-toast");

async function as(page: Page, account: number) {
  await page.goto("/#/dev");
  await page.getByRole("button", { name: new RegExp(`^#${account} ·`) }).click();
}

async function warp(page: Page, label: string) {
  await page.goto("/#/dev");
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(500);
}

async function register(page: Page, slot: number) {
  await page.goto("/#/book");
  await page.getByRole("button", { name: new RegExp(`^25:25:${slot} `) }).click();
  await page.getByRole("button", { name: "Fundar aquí" }).click();
  await expect(stamp(page)).toContainText("Cuenta abierta");
}

test("register, build, train, attack and read the report", async ({ page }) => {
  // Dev accounts never download the passkey stack (it loads on first use).
  const passkeyStack: string[] = [];
  page.on("request", (r) => {
    if (/permissionless|\/ox[./]|uqr/.test(r.url())) passkeyStack.push(r.url());
  });
  await page.addInitScript(() => localStorage.setItem("lang", "es"));
  const slotA = 100;
  await page.goto("/#/dev");
  await page.getByRole("button", { name: "Premium global 30 días" }).click();
  await expect(stamp(page)).toBeVisible();

  await as(page, 1);
  await register(page, slotA);
  await as(page, 2);
  await register(page, slotA + 1);

  await as(page, 1);
  await page.goto("/#/book");
  await page
    .getByRole("row", { name: /^Campo de entrenamiento/ })
    .getByRole("button", { name: "Asentar" })
    .click();
  await expect(stamp(page)).toContainText("Asentado");
  await warp(page, "+1 d");

  await page.goto("/#/book");
  const rowdy = page.getByRole("row", { name: /^Maton/ });
  await rowdy.getByRole("textbox").fill("5");
  await rowdy.getByRole("button", { name: "Entrenar" }).click();
  await expect(stamp(page)).toContainText("Entrenamiento asentado");
  await warp(page, "+1 d");

  await page.goto("/#/map");
  await page.getByRole("button", { name: new RegExp(`^25:25:${slotA + 1} `) }).click();
  await page.getByRole("button", { name: "Atacar" }).click();
  await page.getByRole("textbox", { name: /Cantidad Maton/ }).fill("5");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(stamp(page)).toContainText("Misión en camino");

  await warp(page, "+1 d");
  await page.getByRole("button", { name: "Procesar misiones" }).click();
  // Its own stamp: the one from sending the attack may still be on screen.
  await expect(page.locator(".stamp-toast", { hasText: "Procesar misiones" })).toBeVisible();

  await page.goto("/#/reports");
  await expect(page.getByRole("button", { name: "Ver informe" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Ver informe" }).first().click();
  await expect(page.getByText("Sobrevivientes")).toBeVisible();
  expect(passkeyStack).toEqual([]);

  // Review captures.
  const shots: [string, string][] = [
    ["book", "/#/book"],
    ["map", "/#/map"],
    ["missions", "/#/missions"],
    ["reports", "/#/reports"],
  ];
  for (const [name, url] of shots) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `.impeccable/review/desktop-${name}.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `.impeccable/review/mobile-${name}.png`, fullPage: true });
  }
});

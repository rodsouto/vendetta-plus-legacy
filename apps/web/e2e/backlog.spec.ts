// More missions come due than one transaction processes (B-08): the next action reverts with
// Backlog and the client retries it once with advance() in front, so the player only sees success.
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

async function train(page: Page, quantity: number, timeout = 5_000) {
  await page.goto("/#/book");
  const rowdy = page.getByRole("row", { name: /^Maton/ });
  await rowdy.getByRole("textbox").fill(String(quantity));
  await rowdy.getByRole("button", { name: "Entrenar" }).click();
  await expect(stamp(page)).toContainText("Entrenamiento asentado", { timeout });
}

test("an action retries with advance() when missions piled up", async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => localStorage.setItem("lang", "es"));
  // Above MAX_MISSIONS_PER_TX (4), so drain() alone cannot catch up.
  const missions = 11;
  const slot = 120;
  await page.goto("/#/dev");
  await page.getByRole("button", { name: "Premium global 30 días" }).click();
  await expect(stamp(page)).toBeVisible();

  await as(page, 3);
  await register(page, slot);
  await as(page, 4);
  await register(page, slot + 1);

  // Each side attacks the other (one player cannot store the ammunition for 11 rowdies).
  const sides = [
    { account: 3, target: slot + 1, missions: 6 },
    { account: 4, target: slot, missions: missions - 6 },
  ];
  for (const s of sides) {
    await as(page, s.account);
    await page.goto("/#/book");
    await page
      .getByRole("row", { name: /^Campo de entrenamiento/ })
      .getByRole("button", { name: "Asentar" })
      .click();
    await expect(stamp(page)).toContainText("Asentado");
  }
  await warp(page, "+1 d");
  for (const s of sides) {
    await as(page, s.account);
    await train(page, s.missions);
  }
  await warp(page, "+1 d");

  for (const s of sides) {
    await as(page, s.account);
    for (let i = 0; i < s.missions; i++) {
      await page.goto("/#/map");
      await page.getByRole("button", { name: new RegExp(`^25:25:${s.target} `) }).click();
      await page.getByRole("button", { name: "Atacar" }).click();
      await page.getByRole("textbox", { name: /Cantidad Maton/ }).fill("1");
      await page.getByRole("button", { name: "Enviar", exact: true }).click();
      await expect(stamp(page)).toContainText("Misión en camino");
      await expect(stamp(page)).toBeHidden();
    }
  }

  // Every attack is due now: the first send reverts with Backlog, the retry goes through.
  await warp(page, "+1 d");
  await train(page, 1, 60_000);
  await expect(page.locator(".stamp-toast.error")).toHaveCount(0);

  await page.goto("/#/reports");
  await expect(page.getByRole("button", { name: "Ver informe" })).toHaveCount(missions);
});

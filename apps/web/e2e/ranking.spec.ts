// The ranking follows players who do not act: it is computed from the world projected to now
// (B-18), which settles the buildings whose queues finished (B-06) with no transaction.
import { expect, test, type Page } from "@playwright/test";

const stamp = (page: Page) => page.locator(".stamp-toast");

/** The admin dev account (anvil's account 0): the other specs never open a player with it. */
async function asAdmin(page: Page) {
  await page.goto("/#/dev");
  await page.getByRole("button", { name: /^admin ·/ }).click();
}

async function warp(page: Page, label: string) {
  await page.goto("/#/dev");
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(500);
}

/** Opens an account at `slot` unless the dev account already has one (the specs share a chain). */
async function ensureRegistered(page: Page, slot: number) {
  await page.goto("/#/book");
  const open = page.getByRole("heading", { name: "Abrir una cuenta" });
  await expect(open.or(page.getByRole("button", { name: "Asentar" }).first())).toBeVisible();
  if (!(await open.isVisible())) return;
  await page.getByRole("button", { name: new RegExp(`^25:25:${slot} `) }).click();
  await page.getByRole("button", { name: "Fundar aquí" }).click();
  await expect(stamp(page)).toContainText("Cuenta abierta");
}

test("the ranking rises without the player acting: the projection settles finished queues", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("lang", "es"));
  await asAdmin(page);
  await ensureRegistered(page, 140);
  await page.goto("/#/book");
  await page
    .getByRole("row", { name: /^Campo de entrenamiento/ })
    .getByRole("button", { name: "Asentar" })
    .click();
  await expect(stamp(page)).toContainText("Asentado");

  // The player's own row (bold) and its points before the room finishes.
  await page.goto("/#/ranking");
  const mine = page.locator("tbody tr[style*='font-weight']").first();
  await expect(mine).toBeVisible();
  const pts = async () =>
    Number((await mine.locator("td").nth(3).textContent())!.replace(/\D/g, ""));
  const before = await pts();

  // A day later the room is done. Nobody touches the building: the projection counts it.
  await warp(page, "+1 d");
  await page.goto("/#/ranking");
  await expect.poll(pts).toBeGreaterThan(before);
});

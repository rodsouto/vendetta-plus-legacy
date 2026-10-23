// Market (D-19, B-11): the seller offers from its building, the buyer accepts (the goods and its
// deposit are held), pays with a transport that names the trade and withdraws what it paid for.
import { expect, test, type Page } from "@playwright/test";

const stamp = (page: Page) => page.locator(".stamp-toast");

/** Switches to dev account `account`; returns the start of its address ("0x1234"). */
async function as(page: Page, account: number): Promise<string> {
  await page.goto("/#/dev");
  const button = page.getByRole("button", { name: new RegExp(`^#${account} ·`) });
  const label = (await button.textContent())!;
  await button.click();
  return label.split("· ")[1]!.trim().toLowerCase();
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

test("offer, accept with a deposit, pay by transport and withdraw", async ({ page }) => {
  test.setTimeout(180_000);
  page.on("pageerror", (e) => console.log(`[pageerror] ${e.stack ?? e.message}`));
  await page.addInitScript(() => localStorage.setItem("lang", "es"));
  const slot = 160;
  await as(page, 5);
  await register(page, slot);
  const buyer = await as(page, 6);
  await register(page, slot + 1);

  // The buyer needs troops to pay: a boot camp, then five rowdies.
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

  // The seller offers 300 weapons for 100 dollars (the form's defaults) from its building.
  await as(page, 5);
  await page.goto("/#/market");
  const select = page.getByRole("combobox", { name: /^Comprador/ });
  const option = select.locator("option").filter({ hasText: new RegExp(`^${buyer}`, "i") });
  await select.selectOption({ value: (await option.getAttribute("value"))! });
  await expect(page.getByText("Precio justo según las tasas fijas")).toBeVisible();
  await page.getByRole("button", { name: "Ofrecer", exact: true }).click();
  await expect(stamp(page)).toContainText("Orden asentada");

  // The buyer accepts: 10 dollars of deposit leave its building.
  await as(page, 6);
  await page.goto("/#/market");
  const row = page.getByRole("row", { name: /300 Armas/ });
  await expect(row).toContainText("Fianza 10 Dólares");
  await row.getByRole("button", { name: "Aceptar" }).click();
  await expect(stamp(page)).toContainText("Asentado");
  await expect(row).toContainText("Aceptada");

  // It pays with a transport that names the trade, prefilled from the trade row.
  await row.getByRole("button", { name: "Pagar" }).click();
  await expect(page).toHaveURL(/#\/missions\?/);
  await page.getByRole("textbox", { name: /Cantidad Maton/ }).fill("5");
  await page.getByRole("textbox", { name: /Dólares/ }).fill("100");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(stamp(page)).toContainText("Misión en camino");
  await warp(page, "+1 d");
  await page.getByRole("button", { name: "Procesar misiones" }).click();
  await expect(page.locator(".stamp-toast", { hasText: "Procesar misiones" })).toBeVisible();

  // Paid in full: the weapons and the whole deposit are the buyer's to withdraw.
  await page.goto("/#/market");
  await expect(row).toContainText("Pagada");
  await expect(row).toContainText("Para retirar: 300 Armas, 10 Dólares");
  // Review captures, with the withdrawal form open.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: ".impeccable/review/desktop-market.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: ".impeccable/review/mobile-market.png", fullPage: true });
  // First an edited part (100 weapons and the deposit), then the rest without reloading the page:
  // the dollar input is gone and must not send its old amount again.
  await row.getByRole("textbox", { name: /Armas · Máximo/ }).fill("100");
  await row.getByRole("textbox", { name: /Dólares · Máximo/ }).fill("10");
  await row.getByRole("button", { name: "Retirar" }).click();
  await expect(stamp(page)).toContainText("Retiro asentado");
  await expect(row).toContainText("Para retirar: 200 Armas");
  await expect(row.getByRole("textbox", { name: /Dólares · Máximo/ })).toHaveCount(0);
  await expect(row.getByRole("textbox", { name: /Armas · Máximo/ })).toHaveValue("200");
  await row.getByRole("button", { name: "Retirar" }).click();
  await expect(page.locator(".stamp-toast", { hasText: "Retiro asentado" })).toBeVisible();
  await expect(row).not.toContainText("Para retirar");

  // The seller has nothing left to withdraw and can offer again.
  await as(page, 5);
  await page.goto("/#/market");
  await expect(row).toContainText("Pagada");
  await expect(row.getByRole("button", { name: "Retirar" })).toHaveCount(0);
  await expect(page.getByText("Te queda algo por retirar")).toHaveCount(0);
});

// Several controllers per player (B-26) on the local 4337 stack: a recovery code brings the account
// to a device with a new passkey, that device removes the lost one, and a device from "another
// ecosystem" (its own passkey) joins through the link an existing device approves.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const stamp = (page: Page) => page.locator(".stamp-toast").last();

async function device(context: BrowserContext) {
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem("lang", "es"));
  page.on("dialog", (d) => void d.accept());
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  /** Passkey prompts so far (each assertion bumps the counter). */
  const prompts = async () =>
    (await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials[0]?.signCount ?? 0;
  /** The passkey account this device signed in with (its controller address). */
  const address = () =>
    page.evaluate(() =>
      (
        JSON.parse(localStorage.getItem("vendetta.identity.31337")!) as {
          address: string;
        }
      ).address.toLowerCase(),
    );
  return { page, prompts, address };
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

test("recover with a code, remove the lost device, add a device from another ecosystem", async ({
  browser,
}) => {
  // Phone: opens the account and writes down a recovery code.
  const phone = await device(await browser.newContext());
  await phone.page.goto("/#/book");
  await phone.page.getByRole("button", { name: /^25:25:121 / }).click();
  await phone.page.getByRole("button", { name: "Crear cuenta y fundar aquí" }).click();
  await expect(stamp(phone.page)).toContainText("Cuenta abierta", { timeout: 60_000 });
  const lost = await phone.address();

  await phone.page.goto("/#/account");
  await phone.page.getByRole("button", { name: "Generar un código" }).click();
  const code = (await phone.page.locator(".code-slip").textContent())!.trim();
  expect(code).toMatch(/^([0-9A-Z]{4}-){5}[0-9A-Z]{4}$/);
  await phone.page.getByLabel("Ya lo guardé").check();
  await phone.page.getByRole("button", { name: "Activar el código" }).click();
  await expect(stamp(phone.page)).toContainText("Código activado", { timeout: 60_000 });
  await expect(phone.page.getByText("Código de recuperación 0x")).toBeVisible();

  // The phone is lost. A new device with no passkey recovers the account with the code.
  const fresh = await device(await browser.newContext());
  await fresh.page.goto("/#/book");
  await fresh.page.getByLabel("Código de recuperación").fill(code.toLowerCase());
  await fresh.page.getByRole("button", { name: "Recuperar la cuenta" }).click();
  await expect(stamp(fresh.page)).toContainText("Cuenta recuperada", { timeout: 60_000 });
  const recovered = await fresh.prompts();
  await fresh.page.goto("/#/account");
  await expect(fresh.page.getByText(/^Hasta /)).toBeVisible();
  await expect(fresh.page.getByRole("button", { name: "Quitar", exact: true })).toHaveCount(3);

  // It removes the lost phone; its own session is authorized again in the same operation.
  await fresh.page
    .getByRole("row", { name: new RegExp(short(lost)) })
    .getByRole("button", { name: "Quitar", exact: true })
    .click();
  await expect(stamp(fresh.page)).toContainText("Quitado de la cuenta", { timeout: 60_000 });
  expect(await fresh.prompts()).toBe(recovered + 1);
  await expect(fresh.page.getByRole("button", { name: "Quitar", exact: true })).toHaveCount(2);
  await expect(fresh.page.getByText(/^Hasta /)).toBeVisible();
  await fresh.page.getByRole("button", { name: "Irse de vacaciones (15 días)" }).click();
  await expect(stamp(fresh.page)).toContainText("Irse de vacaciones", { timeout: 60_000 });
  expect(await fresh.prompts()).toBe(recovered + 1);

  // The lost phone no longer reaches the account.
  await phone.page.reload();
  await phone.page.goto("/#/book");
  await expect(phone.page.getByRole("heading", { name: "Abrir una cuenta" })).toBeVisible({
    timeout: 30_000,
  });

  // A laptop of another ecosystem makes its own passkey and shows a link...
  const laptop = await device(await browser.newContext());
  await laptop.page.goto("/#/book");
  await laptop.page.getByRole("button", { name: "Sumar este dispositivo a mi cuenta" }).click();
  await expect(laptop.page.getByRole("heading", { name: "Sumá este dispositivo" })).toBeVisible();
  const created = await laptop.prompts();
  const link = (await laptop.page.locator(".join-link a").getAttribute("href"))!;

  // ...that the recovered device opens and approves (a passkey prompt).
  await fresh.page.goto(link);
  await fresh.page.getByRole("button", { name: "Aprobar dispositivo" }).click();
  await expect(stamp(fresh.page)).toContainText("Dispositivo agregado", { timeout: 60_000 });
  expect(await fresh.prompts()).toBe(recovered + 2);

  // The laptop moves on by itself; its first order publishes its passkey and opens its session.
  await expect(laptop.page.getByRole("heading", { name: "Sumá este dispositivo" })).toBeHidden({
    timeout: 30_000,
  });
  await laptop.page.goto("/#/account");
  await laptop.page.getByRole("button", { name: "Volver de vacaciones" }).click();
  await expect(stamp(laptop.page)).toContainText("Volver de vacaciones", { timeout: 60_000 });
  const joined = await laptop.prompts();
  expect(joined).toBe(created + 1);

  // Its passkey is in the directory now: signing out and back in works.
  await laptop.page.getByRole("button", { name: "Salir", exact: true }).click();
  await laptop.page.goto("/#/book");
  await laptop.page.getByRole("main").getByRole("button", { name: "Entrar con passkey" }).click();
  await expect(stamp(laptop.page)).toContainText("Bienvenido de vuelta", { timeout: 30_000 });
  expect(await laptop.prompts()).toBe(joined + 1);
});

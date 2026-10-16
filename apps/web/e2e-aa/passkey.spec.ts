// Passkey accounts on the local 4337 stack (scripts/aa-stack.ts), with Chrome's virtual WebAuthn
// authenticator standing in for the device: create an account with a new passkey, play through the
// device session without prompts, and sign in from a second device holding the same (synced)
// passkey. Prompts are counted with the credential's signature counter.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const stamp = (page: Page) => page.locator(".stamp-toast").last();

async function device(context: BrowserContext) {
  const page = await context.newPage();
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
  const credentials = async () =>
    (await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials;
  /** Passkey prompts so far (each assertion bumps the counter). */
  const prompts = async () => (await credentials())[0]?.signCount ?? 0;
  return { page, cdp, authenticatorId, credentials, prompts };
}

test("create an account with a passkey, play without prompts, sign in on another device", async ({
  browser,
}) => {
  const a = await device(await browser.newContext());
  await a.page.addInitScript(() => localStorage.setItem("lang", "es"));

  // Device A: entry screen → pick a lot → create the account (passkey + one operation).
  // The entry screen does not download the passkey stack: it loads on the first passkey.
  const passkeyStack: string[] = [];
  a.page.on("request", (r) => {
    if (/permissionless|\/ox[./]|uqr/.test(r.url())) passkeyStack.push(r.url());
  });
  await a.page.goto("/#/book");
  await expect(a.page.getByRole("heading", { name: "Entrar a la ciudad" })).toBeVisible();
  await a.page.getByRole("button", { name: /^25:25:120 / }).click();
  await a.page.waitForLoadState("networkidle");
  expect(passkeyStack).toEqual([]);
  await a.page.getByRole("button", { name: "Crear cuenta y fundar aquí" }).click();
  await expect(stamp(a.page)).toContainText("Cuenta abierta", { timeout: 60_000 });
  expect(await a.credentials()).toHaveLength(1);
  expect(passkeyStack.length).toBeGreaterThan(0); // the filter does see the stack
  const afterCreate = await a.prompts();

  // A game action goes out through the session: no prompt.
  await a.page
    .getByRole("row", { name: /^Campo de entrenamiento/ })
    .getByRole("button", { name: "Asentar" })
    .click();
  await expect(stamp(a.page)).toContainText("Asentado", { timeout: 60_000 });
  expect(await a.prompts()).toBe(afterCreate);

  // The workshop shows on a local chain with passkeys too, without the dev account switcher.
  await a.page.getByRole("link", { name: "Taller" }).click();
  await expect(a.page.getByRole("heading", { name: "Adelantar el tiempo" })).toBeVisible();
  await expect(a.page.getByRole("heading", { name: "Jugar como" })).toHaveCount(0);
  await a.page.getByRole("button", { name: "Premium global 30 días" }).click();
  await expect(stamp(a.page)).toContainText("Asentado", { timeout: 30_000 });
  await a.page.getByRole("button", { name: "+1 h", exact: true }).click();
  await a.page.getByRole("button", { name: "Procesar misiones" }).click();
  await expect(stamp(a.page)).toContainText("Procesar misiones", { timeout: 30_000 });
  expect(await a.prompts()).toBe(afterCreate);

  await a.page.goto("/#/account");
  await expect(a.page.getByText(/^Hasta /)).toBeVisible();

  // Device B holds the same passkey (synced), but no account and no session yet.
  const [synced] = await a.credentials();
  const b = await device(await browser.newContext());
  await b.page.addInitScript(() => localStorage.setItem("lang", "es"));
  await b.cdp.send("WebAuthn.addCredential", {
    authenticatorId: b.authenticatorId,
    credential: synced!,
  });
  const before = await b.prompts();
  await b.page.goto("/#/book");
  await b.page.getByRole("main").getByRole("button", { name: "Entrar con passkey" }).click();
  await expect(stamp(b.page)).toContainText("Bienvenido de vuelta", { timeout: 30_000 });
  await expect(b.page.getByRole("row", { name: /^Campo de entrenamiento/ })).toBeVisible();
  expect(await b.prompts()).toBe(before + 1); // the sign-in assertion

  // The first action authorizes B's session (one prompt), the next ones need none.
  await b.page.goto("/#/account");
  await expect(b.page.getByText("Vencido: la próxima orden te pide la passkey")).toBeVisible();
  await b.page.getByRole("button", { name: "Irse de vacaciones (15 días)" }).click();
  await expect(stamp(b.page)).toContainText("Irse de vacaciones", { timeout: 60_000 });
  expect(await b.prompts()).toBe(before + 2);
  await expect(b.page.getByText(/^Hasta /)).toBeVisible();
  await b.page.getByRole("button", { name: "Volver de vacaciones" }).click();
  await expect(stamp(b.page)).toContainText("Volver de vacaciones", { timeout: 60_000 });
  expect(await b.prompts()).toBe(before + 2);
});

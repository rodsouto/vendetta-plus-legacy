import { expect, test } from "@playwright/test";

test("optional help, persistent dismissal and live expansion recommendations", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem("lang", "es");
    localStorage.setItem("devAccount", "0");
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/dev");
  await page.getByRole("button", { name: /^admin ·/ }).click();
  await page.getByRole("button", { name: "Premium global 30 días" }).click();
  await expect(page.locator(".stamp-toast")).toBeVisible();
  await page.goto("/#/book");
  await page.getByRole("button", { name: /^25:25:230 / }).click();
  await page.getByRole("button", { name: "Fundar aquí" }).click();
  const modal = page.getByRole("dialog", { name: "Tu primer negocio" });
  await expect(modal).toBeVisible();
  await expect(modal.getByRole("button", { name: "Empezar a jugar" })).toBeInViewport();
  await expect(modal.getByText("Construye tu economía", { exact: true })).toBeVisible();
  await expect(modal.getByText("Escuela de especialización", { exact: true })).not.toBeVisible();
  await modal.getByText("Habitaciones, economía y expansión", { exact: true }).click();
  await expect(modal).toContainText("permite investigar");
  await expect(modal).toContainText("cuando están llenos");
  await expect(modal).not.toContainText("Mob School");
  await expect(modal.getByRole("button", { name: "Empezar a jugar" })).toBeInViewport();
  await modal.getByText("Habitaciones, economía y expansión", { exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("guide-mobile.png") });
  await modal.getByRole("button", { name: "Empezar a jugar" }).click();
  await expect(modal).not.toBeVisible();
  const guide = page.getByRole("region", { name: "Tu próximo edificio" });
  await expect(guide).toContainText("Siguiente recomendación: Almacén de munición");
  const beforeGuide = await page.evaluate(() => {
    const guide = document.querySelector(".guide-recommendation")!;
    return ["balance", "next"].every((id) =>
      Boolean(
        document.getElementById(id)!.compareDocumentPosition(guide) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    );
  });
  expect(beforeGuide).toBe(true);
  await expect(guide.getByText("Planificacion de rutas → 5", { exact: true })).not.toBeVisible();
  await guide.getByText("Ver el camino completo", { exact: true }).click();
  await expect(guide.getByText("Planificacion de rutas → 5", { exact: true })).toBeVisible();
  await expect(guide.getByText("Armería → 10", { exact: true })).toBeVisible();
  await expect(guide.getByText("Almacén de munición → 14", { exact: true })).toBeVisible();
  await expect(guide).toContainText("Contrabando → 2");
  await expect(guide).toContainText("Preparar la ocupación");
  await expect(guide).toContainText("Puedes alterar este orden para saquear");
  await expect(
    guide.getByRole("link", { name: "Campo de entrenamiento", exact: true }),
  ).toHaveAttribute("href", /#\/book\?focus=room-\d+/);
  await guide.getByText("Ver el camino completo", { exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("recommendations-mobile.png") });
  await guide.getByRole("link", { name: "Ver Almacén de munición en mi edificio" }).click();
  const production = page.locator('[id^="room-"]').filter({ hasText: /^Almacén de munición/ });
  await expect(production).toBeFocused();
  await production.getByRole("button", { name: "Asentar" }).click();
  await expect(guide).toContainText("En curso: Almacén de munición");
  await expect(guide.locator(".guide-timing")).toContainText("La tarea actual termina en");
  await page
    .getByRole("row", { name: /^Oficina del Jefe/ })
    .getByRole("button", { name: "Asentar" })
    .click();
  await production.getByRole("button", { name: "Asentar" }).click();
  await page
    .getByRole("row", { name: /^Armería/ })
    .getByRole("button", { name: "Asentar" })
    .click();
  await guide.getByText("Ver el camino completo", { exact: true }).click();
  await expect(guide.getByText("En curso", { exact: true })).toHaveCount(1);
  await expect(guide.getByText("En cola", { exact: true })).toHaveCount(3);
  await page.getByRole("button", { name: "Ocultar recomendaciones" }).click();
  await page.reload();
  await expect(modal).not.toBeVisible();
  await expect(guide).not.toBeVisible();
  await page.getByRole("button", { name: "Mostrar recomendaciones" }).click();
  await expect(guide).toBeVisible();
  await page.getByRole("button", { name: "Cómo jugar" }).click();
  await expect(modal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Cómo jugar" })).toBeFocused();
  await page.getByRole("combobox", { name: "Idioma / Language" }).selectOption("en");
  await page.getByRole("button", { name: "How to play" }).click();
  await expect(page.getByRole("dialog", { name: "Your first business" })).toBeVisible();
});

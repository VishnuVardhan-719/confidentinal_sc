import { expect, test } from "@playwright/test";
import { LOCATION_KEY } from "./support/location";

// First visit: no stored answer, so the prompt opens.
test.use({ storageState: { cookies: [], origins: [] } });

const stored = (page: import("@playwright/test").Page) =>
  page.evaluate((key) => window.localStorage.getItem(key), LOCATION_KEY);

test("a first visit asks where care is needed, and a locality is saved and reused", async ({ page }) => {
  await page.goto("/en");
  const dialog = page.getByRole("dialog", { name: "Where do you need care?" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Save my area" }).click();
  await expect(dialog.getByText(/We do not know that locality/)).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Locality or PIN code" })).toBeFocused();

  await dialog.getByRole("combobox", { name: "Locality or PIN code" }).fill("Madhapur");
  await dialog.getByRole("button", { name: "Save my area" }).click();
  await expect(dialog).toBeHidden();
  expect(JSON.parse((await stored(page)) ?? "null")).toEqual({ v: 1, label: "Madhapur", pin: "500081" });

  // The finder starts from the saved area, and the question is not asked again.
  await expect(page.getByRole("combobox", { name: "Your locality or PIN code" })).toHaveValue("Madhapur");
  await page.reload();
  await page.waitForTimeout(1200);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Not now is remembered and nothing else is stored", async ({ page }) => {
  await page.goto("/en/faq");
  const dialog = page.getByRole("dialog", { name: "Where do you need care?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Not now" }).click();
  await expect(dialog).toBeHidden();
  expect(JSON.parse((await stored(page)) ?? "null")).toEqual({ v: 1, skipped: true });
  await page.goto("/en");
  await page.waitForTimeout(1200);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Escape closes the prompt, and the emergency page is never covered", async ({ page }) => {
  await page.goto("/en/emergency");
  await page.waitForTimeout(1200);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto("/en");
  const dialog = page.getByRole("dialog", { name: "Where do you need care?" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("the prompt is translated", async ({ page }) => {
  await page.goto("/te");
  await expect(page.getByRole("dialog", { name: "మీకు ఎక్కడ సేవ కావాలి?" })).toBeVisible();
});

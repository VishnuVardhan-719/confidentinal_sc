import { expect, test } from "@playwright/test";

/**
 * Header/footer emergency links keep their /emergency target; that page leads with a large
 * tel:108 button that is on screen without scrolling, with or without JavaScript.
 */
for (const width of [390, 1280]) {
  test(`header and footer emergency links open /emergency with a prominent tel:108 button at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await page.goto("/en", { waitUntil: "domcontentloaded" });
    const links = page.locator('header a[href="/en/emergency"], footer a[href="/en/emergency"]');
    expect(await links.count()).toBeGreaterThan(0);
    await page.goto("/en/emergency", { waitUntil: "domcontentloaded" });
    const call = page.locator("main").getByRole("link", { name: /call 108/i }).first();
    await expect(call).toHaveAttribute("href", "tel:108");
    const box = await call.boundingBox();
    expect(box, "Call 108 button is rendered").not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(56);
    expect(box!.y + box!.height).toBeLessThanOrEqual(width === 390 ? 844 : 800);
  });
}

test("the tel:108 button works with JavaScript disabled", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/en/emergency");
  await expect(page.locator("main").getByRole("link", { name: /call 108/i }).first()).toHaveAttribute("href", "tel:108");
  await context.close();
});

test("the emergency page leads with a tel:108 button in every language", async ({ page }) => {
  for (const locale of ["en", "te", "hi"]) {
    await page.goto(`/${locale}/emergency`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main").locator('a[href="tel:108"]').first()).toBeVisible();
    await expect(page.locator('a[href="tel:112"]')).toHaveCount(0);
  }
});

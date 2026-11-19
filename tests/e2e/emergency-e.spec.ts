import { expect, test } from "@playwright/test";

/**
 * Header/footer emergency links keep their /emergency target; that page leads with a large
 * tel:112 button that is on screen without scrolling, with or without JavaScript.
 */
for (const width of [390, 1280]) {
  test(`header and footer emergency links open /emergency with a prominent tel:112 button at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await page.goto("/en", { waitUntil: "domcontentloaded" });
    const links = page.locator('header a[href="/en/emergency"], footer a[href="/en/emergency"]');
    expect(await links.count()).toBeGreaterThan(0);
    await page.goto("/en/emergency", { waitUntil: "domcontentloaded" });
    const call = page.locator("main").getByRole("link", { name: /call 112/i }).first();
    await expect(call).toHaveAttribute("href", "tel:112");
    const box = await call.boundingBox();
    expect(box, "Call 112 button is rendered").not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(56);
    expect(box!.y + box!.height).toBeLessThanOrEqual(width === 390 ? 844 : 800);
  });
}

test("the tel:112 button works with JavaScript disabled", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/en/emergency");
  await expect(page.locator("main").getByRole("link", { name: /call 112/i }).first()).toHaveAttribute("href", "tel:112");
  await context.close();
});

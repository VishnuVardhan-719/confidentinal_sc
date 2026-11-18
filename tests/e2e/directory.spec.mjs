import { test, expect, scenario, categories, providerId, visitFixture, expectFitsViewport } from "./fixture-test.mjs";

// FE07 / FRONTEND_MASTER §§5,9,19,20. All cases remain fixme until the routes,
// shared selector contract and isolated fixture scenarios in README.md exist.
scenario("directory.available", () => {
  for (const category of categories) {
    for (const width of [360, 390, 768, 1280]) {
      test.fixme(category.route + " exposes a scoped profile at " + width + "px", async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await visitFixture(page, "/en/" + category.route + "?pin=500001");
        const card = page.getByTestId("provider-card");
        await expect(card).toHaveCount(1);
        await expect(card).toContainText("Synthetic " + category.category + " provider");
        await expect(card.getByTestId("provider-price")).toContainText("₹500.00");
        await expect(card.getByTestId("provider-price")).toContainText(category.unit);
        await expect(card.getByTestId("provider-availability")).toContainText(/advisory|request/i);
        await expect(card.getByRole("link", { name: "View profile", exact: true })).toHaveAttribute("href", "/en/" + category.route + "/" + providerId(category.index) + "?pin=500001");
        await card.getByRole("link", { name: "View profile", exact: true }).click();
        await expect(page.getByTestId("manual-acceptance-notice")).toContainText(/accept/i);
        await expect(page.getByTestId("provider-private-contact")).toHaveCount(0);
        await expectFitsViewport(page);
      });
    }
  }
  test.fixme("PIN validation and mobile Apply/Cancel/Clear use public URL state", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await visitFixture(page, "/en/doctors");
    await expect(page.getByTestId("directory-needs-pin")).toBeVisible();
    await page.getByLabel("PIN code", { exact: true }).fill("123");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(/PIN/i);
    await page.getByLabel("PIN code", { exact: true }).fill("500001");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/pin=500001/);
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Filter providers", exact: true });
    await drawer.getByLabel("Maximum price (₹)", { exact: true }).fill("500");
    await drawer.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(new URL(page.url()).searchParams.has("priceMax")).toBe(false);
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await expect(drawer.getByLabel("Maximum price (₹)", { exact: true })).toHaveValue("");
    await drawer.getByLabel("Maximum price (₹)", { exact: true }).fill("500");
    await drawer.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(page).toHaveURL(/priceMax=50000/);
    await page.reload();
    await expect(page.getByTestId("provider-card")).toHaveCount(1);
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await drawer.getByRole("button", { name: "Clear filters", exact: true }).click();
    await drawer.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(page.getByTestId("directory-needs-pin")).toBeVisible();
    expect(new URL(page.url()).searchParams.has("priceMax")).toBe(false);
    await page.goBack(); await expect(page).toHaveURL(/priceMax=50000/);
    await expect(page.getByTestId("provider-card")).toHaveCount(1);
  });
  test.fixme("unsupported PIN has an actionable empty state and no fabricated providers", async ({ page }) => {
    await visitFixture(page, "/en/doctors?pin=500002");
    await expect(page.getByTestId("directory-empty")).toBeVisible();
    await expect(page.getByTestId("provider-card")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Change PIN", exact: true })).toBeVisible();
  });
  for (const locale of ["en", "te", "hi"]) {
    test.fixme(locale + " directory labels wrap and keyboard links remain usable", async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto("/" + locale + "/doctors?pin=500001");
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      const link = page.getByTestId("provider-card").getByRole("link");
      await link.focus(); await expect(link).toBeFocused(); await page.keyboard.press("Enter");
      await expect(page).toHaveURL(new RegExp("/" + locale + "/doctors/"));
      await expectFitsViewport(page);
    });
  }
});
for (const state of ["empty", "pending", "suspended"]) {
  scenario("directory." + state, () => {
    test.fixme(state + " provider is never publicly bookable", async ({ page }) => {
      await visitFixture(page, "/en/doctors?pin=500001");
      await expect(page.getByTestId("provider-card")).toHaveCount(0);
      await page.goto("/en/doctors/" + providerId(1) + "?pin=500001");
      const request = page.getByRole("button", { name: "Request care", exact: true });
      if (await request.count()) await expect(request).toBeDisabled();
      await expect(page.getByTestId("profile-unavailable")).toBeVisible();
    });
  });
}
scenario("directory.delayed_then_empty", () => {
  test.fixme("refetch marks old cards stale and superseded results cannot become current", async ({ page, appObserver }) => {
    await visitFixture(page, "/en/doctors?pin=500001");
    await expect(page.getByTestId("provider-card")).toHaveCount(1);
    const observation = await appObserver.begin("superseded-directory-requests");
    await page.getByLabel("PIN code", { exact: true }).fill("500002");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByTestId("directory-results")).toHaveAttribute("aria-busy", "true");
    await expect(page.getByTestId("directory-stale-notice")).toBeVisible();
    await expect(page.getByTestId("provider-card").getByRole("link")).toHaveAttribute("aria-disabled", "true");
    await page.getByLabel("PIN code", { exact: true }).fill("500003");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    expect(await appObserver.settle(observation)).toMatchObject({ inFlight: 0 });
    await expect(page.getByTestId("directory-empty")).toBeVisible();
    await expect(page.getByTestId("provider-card")).toHaveCount(0);
    await expect(page).toHaveURL(/pin=500003/);
  });
});
scenario("directory.unavailable_then_available", () => {
  test.fixme("initial skeleton, safe error and explicit retry recover the directory", async ({ page }) => {
    await visitFixture(page, "/en/doctors?pin=500001");
    await expect(page.getByTestId("directory-skeleton")).toBeVisible();
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByTestId("provider-card")).toHaveCount(1);
  });
});

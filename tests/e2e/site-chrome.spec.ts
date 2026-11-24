import { expect, test } from "@playwright/test";

/** Owner-supplied contact details, the priority quote, and dashboard sign-out (2026-11-24). */
const PRIORITY = "Your health is our priority.";

test("footer carries the official contact details and the priority quote on every public page", async ({ page }) => {
  await page.goto("/en");
  const footer = page.getByRole("contentinfo");
  await footer.scrollIntoViewIfNeeded();
  await expect(footer.getByText(PRIORITY)).toBeVisible();
  await expect(footer.getByRole("link", { name: /^\+91 83414 94604/ })).toHaveAttribute("href", "tel:+918341494604");
  await expect(footer.getByRole("link", { name: /^surecurevisit@gmail\.com/ })).toHaveAttribute("href", "mailto:surecurevisit@gmail.com");
  const insta = footer.getByRole("link", { name: /^Surecure\.visit/ });
  await expect(insta).toHaveAttribute("href", /instagram\.com\/surecure\.visit/);
  await expect(footer.getByText(/14\/P Silpa Paradise, Flat no\. 101, near ALEAP Circle, Pragathi Nagar, Hyderabad, Telangana/)).toBeVisible();
});

test("home hero and About header both end with the bold priority quote", async ({ page }) => {
  for (const path of ["/en", "/en/about"]) {
    await page.goto(path);
    const quote = page.getByRole("main").getByText(PRIORITY).first();
    await expect(quote).toBeVisible();
    const weight = await quote.evaluate((el) => Number(getComputedStyle(el).fontWeight));
    expect(weight).toBeGreaterThanOrEqual(600);
  }
});

test("contact page lists how to reach us", async ({ page }) => {
  await page.goto("/en/contact");
  await expect(page.getByRole("main").getByRole("link", { name: /^surecurevisit@gmail\.com/ })).toBeVisible();
});

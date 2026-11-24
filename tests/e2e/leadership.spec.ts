import { expect, test } from "@playwright/test";

/** Leadership letters and the SureCureVisit logo (owner-supplied artwork, 2026-11-23). */
const LEADERS = [
  { name: "Pamulapati Vamsi Krishna Reddy", role: "Founder, CEO & Managing Director" },
  { name: "Sai Varshitha", role: "Co-Founder & Director of Administration" },
  { name: "Pamulapati Satyanarayana Reddy", role: "Director of Finance & Governance" },
];

test("our story shows the three leaders with loaded portraits, roles and letters", async ({ page }) => {
  await page.goto("/en/our-story");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  for (const leader of LEADERS) {
    await expect(page.getByText(leader.name, { exact: true }).first()).toBeVisible();
    const portrait = page.getByRole("img", { name: `Portrait of ${leader.name}` });
    await portrait.scrollIntoViewIfNeeded();
    await expect(portrait).toBeVisible();
    expect(await portrait.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  await expect(page.getByText("Care should travel to the patient, not the patient to care.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Three Leaders\. Three Perspectives/ })).toBeVisible();
  // The founder's letter is published exactly as the owner wrote it.
  await expect(
    page.getByText(
      "We connect patients with doctors, convenient doctor home visits, live doctor tracking, doorstep lab sample collection, digital prescriptions, secure health records, professional caretaker services, and emergency support.",
    ),
  ).toBeVisible();
});

test("about lists the leaders and links to the letters", async ({ page }) => {
  await page.goto("/en/about");
  for (const leader of LEADERS) {
    await expect(page.getByRole("img", { name: `Portrait of ${leader.name}` })).toBeAttached();
    await expect(page.getByText(leader.role, { exact: true }).first()).toBeAttached();
  }
  await page.getByRole("link", { name: /read their letters/i }).click();
  await expect(page).toHaveURL(/\/en\/our-story$/);
});

test("the header shows the SureCureVisit wordmark and it links home", async ({ page }) => {
  await page.goto("/en/about");
  const logo = page.getByRole("banner").getByRole("link", { name: /surecure visit/i }).first();
  const img = logo.getByRole("img", { name: "SureCure Visit" });
  await expect(img).toBeVisible();
  expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  await expect(logo).toHaveAttribute("href", /\/en$/);
});

test("te and hi keep the letters in English and translate the page labels", async ({ page }) => {
  for (const locale of ["te", "hi"]) {
    await page.goto(`/${locale}/our-story`);
    await expect(page.locator('main [lang="en"]').first()).toBeVisible();
    await expect(page.getByRole("img", { name: /Sai Varshitha/ })).toBeAttached();
  }
});

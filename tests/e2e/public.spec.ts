import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const LOCALES = ["en", "te", "hi"] as const;
const PAGES = [
  "",
  "/about",
  "/our-story",
  "/stories",
  "/how-it-works",
  "/faq",
  "/contact",
  "/privacy",
  "/terms",
  "/refunds",
  "/become-a-provider",
  "/memberships",
  "/emergency",
] as const;

/** Routes built by other workstreams (phase 2). Links to them are expected and may 404 for now. */
const OTHER_OWNER_PREFIXES = ["/doctors", "/lab-tests", "/ambulances", "/caretakers", "/login", "/signup"];

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(summary).toEqual([]);
}

test.describe("public pages render in every locale", () => {
  for (const locale of LOCALES) {
    for (const path of PAGES) {
      test(`${locale}${path || "/"}`, async ({ page }) => {
        const res = await page.goto(`/${locale}${path}`);
        expect(res?.status()).toBe(200);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("h1")).toHaveCount(1);
        await expect(page.locator("main#main-content")).toHaveCount(1);
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/${locale}${path}$`));
        await expect(page.locator('link[rel="alternate"][hreflang="te"]')).toHaveCount(1);

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);

        const text = await page.locator("body").innerText();
        expect(text).not.toMatch(/\b(public|common|errors|accessibility)\.[a-z]+\.[a-zA-Z]/);
        if (locale === "te") expect(text).toMatch(/[\u0C00-\u0C7F]/);
        if (locale === "hi") expect(text).toMatch(/[\u0900-\u097F]/);

        await expectNoAxeViolations(page);
      });
    }
  }
});

test("bare paths redirect to the default locale", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
  await page.goto("/faq");
  await expect(page).toHaveURL(/\/en\/faq$/);
});

test("unknown routes and unpublished stories show the localized 404", async ({ page }) => {
  for (const [url, title] of [
    ["/te/no-such-page", "ఆ పేజీ మాకు దొరకలేదు"],
    ["/en/stories/anything", "We could not find that page"],
    ["/hi/stories/anything", "हमें वह पेज नहीं मिला"],
  ] as const) {
    const res = await page.goto(url);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  }
});

test("landing shows all content blocks and no fabricated social proof", async ({ page }) => {
  await page.goto("/en");
  for (const name of [
    "Care that comes closer.",
    "Who serves your PIN code?",
    "Four kinds of care, booked the same way",
    "How a visit happens",
    "What “verified” means here",
    "Built around the home",
    "Stories and health awareness",
    "Memberships",
    "Offer your services on SureCure Visit",
    "Questions people ask first",
  ]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByText("No stories published yet")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/★|\d+\s*\+?\s*(patients|doctors|reviews|ratings)|#1/i);
  await expect(page.getByRole("contentinfo")).toBeVisible();
});

test("every link on public pages points to a real route", async ({ page, request }) => {
  const hrefs = new Set<string>();
  for (const path of PAGES) {
    await page.goto(`/en${path}`);
    const found = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    found.forEach((h) => hrefs.add(h));
  }
  for (const href of hrefs) {
    if (href.startsWith("tel:")) {
      expect(href).toBe("tel:112");
      continue;
    }
    if (href.startsWith("#")) continue;
    expect(href.startsWith("/"), `external or empty link: ${href}`).toBe(true);
    const pathOnly = href.split("#")[0].split("?")[0];
    const unlocalized = pathOnly.replace(/^\/(en|te|hi)(?=\/|$)/, "") || "/";
    if (OTHER_OWNER_PREFIXES.some((p) => unlocalized.startsWith(p))) continue;
    const res = await request.get(pathOnly);
    expect(res.status(), href).toBe(200);
  }
});

test("finder validates the PIN and routes to the chosen directory", async ({ page }) => {
  await page.goto("/en#finder");
  await page.getByRole("button", { name: "Show providers" }).click();
  await expect(page.getByText("Enter your 6-digit PIN code")).toBeVisible();
  await expect(page.getByText("Choose a service")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "PIN code" })).toBeFocused();

  await page.getByRole("textbox", { name: "PIN code" }).fill("012345");
  await page.locator('label[for="finder-service-labTests"]').click();
  await expect(page.getByRole("radio", { name: /Lab tests/ })).toBeChecked();
  await page.getByRole("button", { name: "Show providers" }).click();
  await expect(page.getByText("A PIN code has 6 digits and does not start with 0")).toBeVisible();

  await page.getByRole("textbox", { name: "PIN code" }).fill("500001");
  await page.getByRole("button", { name: "Show providers" }).click();
  await expect(page).toHaveURL(/\/en\/lab-tests\?pin=500001$/);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("emergency page works and offers a tel:112 call", async ({ page }) => {
    const res = await page.goto("/hi/emergency");
    expect(res?.status()).toBe(200);
    const call = page.getByRole("link", { name: "112 पर कॉल करें", exact: true });
    await expect(call).toHaveAttribute("href", "tel:112");
    await expect(call).toBeVisible();
  });

  test("finder submits as a plain form", async ({ page }) => {
    await page.goto("/te");
    await page.getByRole("textbox", { name: "పిన్ కోడ్" }).fill("500001");
    await page.locator('input[name="service"][value="caretakers"]').check({ force: true });
    await page.locator('form[action="/te/find"] button[type="submit"]').click();
    await expect(page).toHaveURL(/\/te\/caretakers\?pin=500001$/);
  });

  test("FAQ answers are readable and no inert search box is shown", async ({ page }) => {
    await page.goto("/en/faq");
    await expect(page.getByRole("searchbox")).toBeHidden();
    await page.getByText("Who sets the price?").click();
    await expect(page.getByText("Each provider sets their own price.")).toBeVisible();
  });
});

test("FAQ search filters questions", async ({ page }) => {
  await page.goto("/en/faq");
  await page.getByRole("searchbox", { name: "Search questions" }).fill("cancel");
  await expect(page.locator("details")).toHaveCount(1);
  await expect(page.getByText("1 question matches")).toBeVisible();
  await page.getByRole("searchbox").fill("qwertyuiop");
  await expect(page.getByText("No matching questions")).toBeVisible();
});

test("language switch keeps the current route and query", async ({ page }) => {
  await page.goto("/en/how-it-works?ref=test");
  if (isMobile(page)) {
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "తెలుగు" }).click();
  } else {
    await page.getByRole("button", { name: /Language/ }).click();
    await page.getByRole("menuitem", { name: "తెలుగు" }).click();
  }
  await expect(page).toHaveURL(/\/te\/how-it-works\?ref=test$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "te");
});

test("mobile menu traps focus, closes on Escape and restores focus", async ({ page }) => {
  test.skip(!isMobile(page), "mobile only");
  await page.goto("/en");
  const trigger = page.getByRole("button", { name: "Open menu" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("skip link moves focus to main content", async ({ page }) => {
  await page.goto("/en/about");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);
});

test("robots and sitemap respond", async ({ request }) => {
  expect((await request.get("/robots.txt")).status()).toBe(200);
  expect((await request.get("/sitemap.xml")).status()).toBe(200);
});

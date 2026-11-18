import { expect, test, type Page } from "@playwright/test";

/**
 * Nav walk (USER-REQ-1 A): every link in the public header (desktop menu + mobile sheet), the
 * footer and the landing page must resolve. Routes built by other workstreams are listed as
 * PENDING; set NAV_WALK_STRICT=1 on the integrated branch to require them too.
 */
const PENDING_PREFIXES = ["/doctors", "/lab-tests", "/ambulances", "/caretakers", "/login", "/signup"];
const STRICT = process.env.NAV_WALK_STRICT === "1";
const LOCALES = ["en", "te", "hi"] as const;

// The full desktop header starts at the xl breakpoint (1280px); below it the menu sheet is used.
const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1280;

async function collectNavLinks(page: Page, locale: string): Promise<string[]> {
  await page.goto(`/${locale}`);
  const hrefs = new Set<string>();
  const grab = async (selector: string) => {
    for (const h of await page.locator(selector).evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))) hrefs.add(h);
  };
  if (isMobile(page)) {
    await page.getByRole("banner").getByRole("button", { name: /menu|మెనూ|मेनू/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await grab('[role="dialog"] a[href]');
    await page.keyboard.press("Escape");
  } else {
    await page.getByRole("banner").getByRole("button").first().click(); // Services menu
    await grab('[role="menu"] a[href]');
    await page.keyboard.press("Escape");
  }
  await grab("header a[href]");
  await grab("footer a[href]");
  await grab("main a[href]");
  return [...hrefs];
}

for (const locale of LOCALES) {
  test(`every public nav link resolves (${locale})`, async ({ page, request }) => {
    test.setTimeout(180_000);
    const hrefs = await collectNavLinks(page, locale);
    expect(hrefs.length).toBeGreaterThan(20);
    const pending: string[] = [];
    for (const href of hrefs) {
      expect(href, "empty or placeholder link").not.toMatch(/^(#|javascript:)?$/);
      if (href.startsWith("tel:")) {
        expect(href).toBe("tel:112");
        continue;
      }
      if (href.startsWith("#")) continue;
      // Internal only; language-switch links may point at another locale.
      expect(/^\/(en|te|hi)(\/|$|\?|#)/.test(href), `link leaves the site: ${href}`).toBe(true);
      const path = href.split("#")[0];
      const unlocalized = path.split("?")[0].replace(/^\/(en|te|hi)/, "") || "/";
      if (!STRICT && PENDING_PREFIXES.some((p) => unlocalized === p || unlocalized.startsWith(`${p}/`))) {
        pending.push(unlocalized);
        continue;
      }
      const res = await request.get(path, { maxRedirects: 3 });
      expect(res.status(), href).toBe(200);
    }
    test.info().annotations.push({ type: "pending-routes", description: [...new Set(pending)].join(", ") });
  });
}

test("signed-out header offers sign in with a safe return path and create account", async ({ page }) => {
  await page.goto("/en/faq");
  if (isMobile(page)) {
    await page.getByRole("banner").getByRole("button", { name: "Open menu" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/en/signup");
    await expect(dialog.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/en/login?next=%2Ffaq");
    await page.keyboard.press("Escape"); // the open sheet hides the rest of the page from AT
  } else {
    const banner = page.getByRole("banner");
    await expect(banner.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/en/signup");
    await expect(banner.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/en/login?next=%2Ffaq");
  }
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/en/signup");
});

test("hero doctor search routes to the results page with query and coarse location", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("textbox", { name: "City or PIN code" }).fill("Hyderabad");
  const q = page.getByRole("combobox", { name: "Doctor, speciality or symptom" });
  await q.fill("fever");
  await expect(page.getByText("Suggestions are not available yet. Press Enter to search.").first()).toBeVisible();
  await q.press("Enter");
  await expect(page).toHaveURL(/\/en\/doctors\?q=fever&city=Hyderabad$/);
});

test.describe("hero doctor search without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("submits through /find to the results page", async ({ page }) => {
    await page.goto("/hi");
    await page.getByRole("textbox", { name: "शहर या पिन कोड" }).fill("500001");
    await page.getByRole("searchbox", { name: "डॉक्टर, विशेषज्ञता या लक्षण" }).fill("बुखार");
    await page.getByRole("button", { name: "डॉक्टर खोजें" }).click();
    await expect(page).toHaveURL(/\/hi\/doctors\?q=%E0.*&pin=500001$/);
  });
});

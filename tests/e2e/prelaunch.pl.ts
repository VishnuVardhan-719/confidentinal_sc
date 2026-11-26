import { expect, test } from "@playwright/test";
import en from "../../src/messages/en/public.json";
import hi from "../../src/messages/hi/public.json";
import te from "../../src/messages/te/public.json";

const TITLE = { en: en.prelaunch.title, te: te.prelaunch.title, hi: hi.prelaunch.title } as const;

/**
 * Pre-launch mode (LAUNCH_MODE=prelaunch, APP_ENV=production, FRONTEND_ADAPTER=http, NO backend).
 * Run only via tests/e2e/prelaunch.config.ts (its own server); the `.pl.ts` suffix keeps it out of
 * the fixture suites, which do not set LAUNCH_MODE.
 */
const OPEN = ["/en", "/en/about", "/en/our-story", "/en/how-it-works", "/en/faq", "/en/contact", "/en/privacy", "/en/terms", "/en/refunds", "/en/memberships", "/en/emergency", "/te/about", "/hi/contact"];
const CLOSED = ["/en/login", "/en/signup", "/en/doctors", "/en/find", "/en/lab-tests", "/en/ambulances", "/en/caretakers", "/en/stories", "/en/become-a-provider", "/en/patient/dashboard", "/en/admin", "/en/doctor/visits", "/hi/login", "/te/doctors"];

test("open information pages render with no backend", async ({ request }) => {
  for (const path of OPEN) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
  }
});

test("every gated route answers with the holding page, noindex by header", async ({ request }) => {
  for (const path of CLOSED) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()["x-robots-tag"], path).toContain("noindex");
    const locale = path.slice(1, 3) as keyof typeof TITLE;
    const html = await res.text();
    expect(html, path).toContain(TITLE[locale]);
  }
});

test("encoded or dotted spellings of a gated route are held too", async ({ request }) => {
  for (const path of ["/%65n/login", "/%45n/signup", "/en/doctors/a.b", "/en/verify/abc.def", "/en/stories/x.y", "/te/patient/x.y", "/en//login"]) {
    const res = await request.get(path, { maxRedirects: 5 });
    const html = await res.text();
    expect(html, path).toContain(TITLE[path.includes("/te/") ? "te" : "en"]);
    expect(html, path).not.toContain("Sign in to SureCure Visit");
  }
});

test("a state-changing request to any page is refused", async ({ request }) => {
  for (const path of ["/en", "/en/login", "/en/about", "/en/patient/dashboard"]) {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      const res = await request.fetch(path, { method });
      expect(res.status(), `${method} ${path}`).toBe(503);
    }
  }
});

test("the holding page is polite and useful", async ({ page }) => {
  await page.goto("/en/doctors");
  await expect(page.getByRole("heading", { level: 1, name: "This part opens at launch" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /^Back to home/ })).toBeVisible();
  await expect(page.getByRole("main").getByText(/108/)).toBeVisible();
});

test("a finder search lands on the holding page, not a directory", async ({ page }) => {
  await page.goto("/en/find?pin=500001");
  await expect(page.getByRole("heading", { level: 1, name: "This part opens at launch" })).toBeVisible();
});

test("robots, sitemap and llms.txt describe only the open pages", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/Allow: \//);
  for (const p of ["doctors", "login", "signup", "find"]) expect(robots, p).toContain(`/${p}`);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/en/about");
  for (const p of ["/doctors", "/login", "/signup", "/lab-tests", "/ambulances", "/caretakers", "/stories", "/launching-soon"]) expect(sitemap, p).not.toContain(p);
  const llms = await (await request.get("/llms.txt")).text();
  expect(llms).toContain("launching soon");
  expect(llms).not.toContain("/doctors");
});

test("the holding page itself is noindex", async ({ page }) => {
  await page.goto("/en/login");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

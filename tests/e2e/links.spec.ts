/*
 * Dead-link check: collects every same-site href on every route (signed out, then signed in per role against
 * the synthetic /api) and requests it. Any target answering >= 400 is reported with the page it was found on.
 */
import { expect, test, type Page } from "@playwright/test";
import { mockBackend, signIn } from "./helpers";

const PUBLIC = [
  "/", "/how-it-works", "/categories", "/categories/doctor", "/categories/lab", "/categories/scheduled-ambulance",
  "/categories/caretaker", "/about", "/accessibility", "/contact", "/faq", "/privacy", "/providers", "/terms",
  "/sign-in", "/sign-up", "/forgot-password", "/sign-out", "/this-route-does-not-exist",
];
const AS_ROLE: [string[], string[]][] = [
  [["patient"], ["/dashboard", "/book", "/account"]],
  [["patient", "doctor"], ["/provider", "/provider/onboarding"]],
  [["patient", "admin"], ["/admin"]],
];

async function hrefsOn(page: Page, path: string): Promise<string[]> {
  await page.goto(path, { waitUntil: "load" });
  await page.waitForLoadState("networkidle");
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
      .map((a) => a.getAttribute("href") ?? "")
      .filter((h) => h.startsWith("/") && !h.startsWith("//")),
  );
}

test("no dead same-site links on any route", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop-1280", "one viewport is enough for link targets");
  test.setTimeout(240_000);
  const foundOn = new Map<string, Set<string>>();
  const record = (from: string, hrefs: string[]) => {
    for (const href of hrefs) {
      const target = href.split("#")[0] || "/";
      if (!foundOn.has(target)) foundOn.set(target, new Set());
      foundOn.get(target)!.add(from);
    }
  };

  const guest = await browser.newPage();
  for (const path of PUBLIC) record(path, await hrefsOn(guest, path));
  for (const [roles, paths] of AS_ROLE) {
    const page = await browser.newPage();
    await mockBackend(page, { roles });
    await signIn(page);
    for (const path of paths) record(`${path} (as ${roles.join("+")})`, await hrefsOn(page, path));
    await page.close();
  }

  const dead: string[] = [];
  for (const [target, sources] of foundOn) {
    const res = await guest.request.get(target, { maxRedirects: 5 });
    if (res.status() >= 400) dead.push(`${res.status()} ${target}  <- found on ${[...sources].join(", ")}`);
  }
  expect(dead, "dead links").toEqual([]);
});

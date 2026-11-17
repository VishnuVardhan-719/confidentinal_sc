/*
 * Dead-link check: collects every same-site href on every route (anonymous and as each demo role) and
 * requests it. Any target answering >= 400 is reported with the page it was found on.
 */
import { expect, test, type Page } from "@playwright/test";
import type { DemoRole } from "../../src/lib/demo/data";
import { signInAsDemo } from "./helpers";

const PUBLIC = [
  "/", "/how-it-works", "/categories", "/categories/doctor", "/categories/lab", "/categories/scheduled-ambulance",
  "/categories/caretaker", "/providers/demo-dr-1", "/providers/demo-amb-1", "/about", "/accessibility", "/contact",
  "/faq", "/privacy", "/providers", "/terms", "/sign-in", "/sign-up", "/forgot-password", "/verify", "/sign-out",
  "/this-route-does-not-exist",
];
const AS_ROLE: [DemoRole, string[]][] = [
  ["patient", ["/dashboard", "/book", "/account"]],
  ["doctor", ["/provider", "/provider/onboarding"]],
  ["caretaker", ["/caretaker"]],
  ["admin", ["/admin"]],
];

async function hrefsOn(page: Page, path: string): Promise<string[]> {
  await page.goto(path, { waitUntil: "load" });
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
      .map((a) => a.getAttribute("href") ?? "")
      .filter((h) => h.startsWith("/") && !h.startsWith("//")),
  );
}

test("no dead same-site links on any route", async ({ page }, info) => {
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

  for (const path of PUBLIC) record(path, await hrefsOn(page, path));
  for (const [role, paths] of AS_ROLE) {
    await signInAsDemo(page, role);
    for (const path of paths) record(`${path} (as ${role})`, await hrefsOn(page, path));
  }

  const dead: string[] = [];
  for (const [target, sources] of foundOn) {
    const res = await page.request.get(target, { maxRedirects: 5 });
    if (res.status() >= 400) dead.push(`${res.status()} ${target}  ← found on ${[...sources].join(", ")}`);
  }
  expect(dead, "dead links").toEqual([]);
});

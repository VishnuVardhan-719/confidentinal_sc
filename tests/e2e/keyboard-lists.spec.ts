import { expect, test, type Page } from "@playwright/test";
import { signInAs, type Persona } from "./support/operations";

/**
 * R9-E7 keyboard pass over the list pages of the operations and admin areas (synthetic fixture data,
 * read-only). For each page, using only Tab and Enter:
 *   1. the first Tab stop is the skip link, it is visible, and Enter moves focus into the main landmark;
 *   2. every focus stop shows a visible indicator (outline or ring);
 *   3. nothing traps focus: the same control is never focused for more than two Tab presses in a row;
 *   4. every control inside <main> that a pointer user can use is reachable by Tab.
 * Run in a single project: --project=desktop-1280.
 */

const PAGES: { persona: Persona; paths: string[] }[] = [
  { persona: "labManager", paths: ["/lab/orders", "/lab/collections", "/lab/reports", "/lab/catalog", "/lab/branches", "/lab/staff"] },
  { persona: "ambulanceOperator", paths: ["/ambulance/requests", "/ambulance/trips", "/ambulance/fleet", "/ambulance/crew"] },
  { persona: "agencyManager", paths: ["/caretaker/requests", "/caretaker/assignments", "/caretaker/shifts", "/caretaker/services", "/caretaker/staff"] },
  { persona: "adminLead", paths: ["/admin/bookings", "/admin/users", "/admin/payments", "/admin/audit", "/admin/support"] },
];

const TABBABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';

type Stop = { key: string; inMain: boolean; indicator: boolean; label: string };

/** Count the controls a keyboard user can reach: visible, enabled, not removed from the Tab order. */
async function tabbableCounts(page: Page): Promise<{ all: number; main: number }> {
  return page.evaluate((selector) => {
    const usable = (el: Element) => {
      const node = el as HTMLElement;
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none" && !(node as HTMLButtonElement).disabled && node.tabIndex >= 0;
    };
    const all = [...document.querySelectorAll(selector)].filter(usable);
    return { all: all.length, main: all.filter((el) => el.closest("main")).length };
  }, TABBABLE);
}

async function currentStop(page: Page): Promise<Stop | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const style = getComputedStyle(el);
    const outline = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
    // A ring needs a visible shadow: not "none", not fully transparent and not all-zero lengths.
    const shadowLengths = style.boxShadow.replace(/rgba?\([^)]*\)/g, "").match(/-?\d*\.?\d+px/g) ?? [];
    const shadowColour = style.boxShadow.match(/rgba?\(([^)]*)\)/)?.[1].split(",").map((n) => parseFloat(n)) ?? [];
    const transparent = shadowColour.length === 4 && shadowColour[3] === 0;
    const ring = style.boxShadow !== "none" && style.boxShadow !== "" && !transparent && shadowLengths.some((n) => parseFloat(n) !== 0);
    const path: string[] = [];
    for (let node: HTMLElement | null = el; node && node !== document.body; node = node.parentElement) {
      path.push(`${node.tagName}${node.id ? `#${node.id}` : ""}:${[...(node.parentElement?.children ?? [])].indexOf(node)}`);
    }
    return {
      key: path.join("/"),
      inMain: el.closest("main") !== null,
      indicator: outline || ring,
      label: (el.getAttribute("aria-label") ?? el.textContent ?? el.getAttribute("name") ?? el.tagName).trim().slice(0, 40),
    };
  });
}

test.describe("keyboard pass: list pages", () => {
  for (const { persona, paths } of PAGES) {
    test(`${persona}: skip link, focus indicator, no trap, main controls reachable`, async ({ page }) => {
      test.setTimeout(60_000 + paths.length * 40_000);
      await signInAs(page, persona, `/en${paths[0]}`);
      const problems: string[] = [];

      for (const path of paths) {
        await page.goto(`/en${path}`, { waitUntil: "load" });
        await page.waitForLoadState("networkidle").catch(() => undefined);
        // Start from the top of the document, as a keyboard user does after a navigation.
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        const counts = await tabbableCounts(page);

        await page.keyboard.press("Tab");
        const first = await currentStop(page);
        if (!first || !/skip to main/i.test(first.label)) problems.push(`${path}: first Tab stop is "${first?.label ?? "nothing"}", not the skip link`);
        else {
          if (!first.indicator) problems.push(`${path}: skip link has no visible focus indicator`);
          await page.keyboard.press("Enter");
          const landed = await page.evaluate(() => {
            const el = document.activeElement;
            return el !== null && (el.id === "main-content" || el.closest("main") !== null);
          });
          if (!landed) problems.push(`${path}: Enter on the skip link did not move focus into main`);
        }

        // Walk the whole page from the top again (a fresh load puts the Tab starting point back at the top).
        await page.goto(`/en${path}`, { waitUntil: "load" });
        await page.waitForLoadState("networkidle").catch(() => undefined);
        const seen = new Map<string, Stop>();
        let repeats = 0;
        let previous = "";
        for (let i = 0; i < counts.all + 3; i++) {
          await page.keyboard.press("Tab");
          const stop = await currentStop(page);
          if (!stop) break; // focus left the page (browser chrome): the page did not trap it
          repeats = stop.key === previous ? repeats + 1 : 0;
          previous = stop.key;
          if (repeats >= 2) {
            problems.push(`${path}: focus is stuck on "${stop.label}"`);
            break;
          }
          if (!stop.indicator) problems.push(`${path}: "${stop.label}" has no visible focus indicator`);
          seen.set(stop.key, stop);
        }
        const reachedInMain = [...seen.values()].filter((s) => s.inMain).length;
        if (reachedInMain < counts.main) problems.push(`${path}: ${counts.main - reachedInMain} of ${counts.main} controls in main are not reachable by Tab`);
      }

      expect(problems).toEqual([]);
    });
  }
});

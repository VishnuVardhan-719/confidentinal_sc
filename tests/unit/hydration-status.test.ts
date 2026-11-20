// @vitest-environment jsdom
/**
 * ADVERSARIAL_REVIEW D4: controls disabled until hydration (R-FE-D-40) come with aria-busy on the
 * form and a visually hidden "Please wait." status, both gone once React owns the page.
 */
import { act } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import common from "@/messages/en/common.json";
import { HydrationStatus, hydrationBusy } from "@/components/clinical/hydration-status";
import { useHydrated } from "@/components/clinical/use-hydrated";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  document.body.innerHTML = "";
});

const h = createElement;
const withIntl = (ui: ReactNode) => h(NextIntlClientProvider, { locale: "en", messages: { common }, timeZone: "Asia/Kolkata", children: ui });

/** The same pattern every gated form uses. */
function GatedForm() {
  const hydrated = useHydrated();
  return h("form", { "aria-label": "Synthetic", ...hydrationBusy(hydrated) }, h(HydrationStatus, { hydrated }), h("input", { "aria-label": "Field", disabled: !hydrated, defaultValue: "" }));
}

describe("hydration busy state (D4)", () => {
  it("server HTML: form is aria-busy, fields disabled, status says why", () => {
    const html = renderToString(withIntl(h(GatedForm)));
    const div = document.createElement("div");
    div.innerHTML = html;
    expect(div.querySelector("form")?.getAttribute("aria-busy")).toBe("true");
    expect(div.querySelector("input")?.disabled).toBe(true);
    const status = div.querySelector('[role="status"]');
    expect(status?.textContent).toBe(common.actions.working);
    expect(status?.className).toContain("sr-only");
  });

  it("after hydration: no aria-busy, fields enabled, status empty", async () => {
    const ui = withIntl(h(GatedForm));
    const container = document.createElement("div");
    container.innerHTML = renderToString(ui);
    document.body.appendChild(container);
    await act(async () => {
      hydrateRoot(container, ui);
    });
    expect(container.querySelector("form")?.hasAttribute("aria-busy")).toBe(false);
    expect(container.querySelector("input")?.disabled).toBe(false);
    expect(container.querySelector('[role="status"]')?.textContent).toBe("");
  });

  it("every component that gates on useHydrated() also renders the busy state and status", () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : /\.tsx$/.test(n) ? [join(d, n)] : []));
    const users = walk("src").filter((f) => /useHydrated\(\)/.test(readFileSync(f, "utf8")));
    expect(users.length).toBeGreaterThanOrEqual(7);
    const missing = users.filter((f) => {
      const s = readFileSync(f, "utf8");
      return !(/<HydrationStatus hydrated=\{hydrated\} \/>/.test(s) && /hydrationBusy\(hydrated\)/.test(s));
    });
    expect(missing).toEqual([]);
  });
});

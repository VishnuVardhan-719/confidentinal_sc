// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import accessibility from "@/messages/en/accessibility.json";
import common from "@/messages/en/common.json";
import errors from "@/messages/en/errors.json";
import support from "@/messages/en/support.json";
import { DoctorSearch } from "@/components/public/doctor-search";
import { FaqSearch } from "@/components/public/faq-search";
import { ServiceFinder } from "@/components/public/service-finder";
import { PhoneInput } from "@/components/shared/phone-input";
import { OTPInput } from "@/components/shared/otp-input";
import { SupportTicketForm } from "@/components/support/support-ticket-form";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
  notFound: vi.fn(),
}));

afterEach(cleanup);

const SRC = path.resolve(import.meta.dirname, "../../src");
const PUBLIC = path.join(SRC, "app", "[locale]", "(public)");
const read = (p: string) => readFileSync(p, "utf8");

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return pages(full);
    return name === "page.tsx" ? [full] : [];
  });
}

/** Components that render exactly one <h1>. */
const H1_COMPONENTS = ["<PublicPageIntro", "<LegalDocument", "<DoctorSearchIntro", "<DoctorProfile"];

/** Pages whose h1 comes from the localized not-found page (they only call notFound()). */
const NOT_FOUND_ONLY = [path.join("[...rest]", "page.tsx")];

describe("public pages: static structure", () => {
  const files = pages(PUBLIC);

  it("finds all public pages", () => {
    expect(files.length).toBeGreaterThanOrEqual(14);
  });

  it.each(files.map((f) => [path.relative(PUBLIC, f), f]))("%s renders exactly one h1 source", (rel, file) => {
    const src = read(file);
    if (NOT_FOUND_ONLY.includes(rel)) {
      expect(src).toContain("notFound()");
      return;
    }
    const direct = (src.match(/<h1[\s>]/g) ?? []).length;
    const viaComponent = H1_COMPONENTS.reduce((n, c) => n + src.split(c).length - 1, 0);
    // stories/[slug] has one h1 on the article path; its "unavailable" branch is tracked in REQUESTS R-FE01-13.
    expect(direct + viaComponent, rel).toBe(1);
  });

  it("root layout has a skip link and the public layout has header, main target and footer landmarks", () => {
    const root = read(path.join(SRC, "app", "[locale]", "layout.tsx"));
    expect(root).toContain("<SkipLink />");
    expect(root).toMatch(/<html lang=\{locale\}/);
    const layout = read(path.join(PUBLIC, "layout.tsx"));
    expect(layout).toMatch(/<main id=\{MAIN_CONTENT_ID\}/);
    expect(layout).toContain("<Footer />");
    expect(layout).toContain("<PublicHeaderWithAccount />");
    const header = read(path.join(SRC, "components", "shared", "public-header.tsx"));
    expect(header).toMatch(/<header[\s>]/);
    expect(header).toMatch(/<nav aria-label=\{ta\("mainNavigation"\)\}/);
    const footer = read(path.join(SRC, "components", "shared", "footer.tsx"));
    expect(footer).toMatch(/<footer[\s>]/);
    expect(footer).toMatch(/<nav aria-label=\{ta\("footerNavigation"\)\}/);
  });

  it("styles keep visible focus and honour reduced motion", () => {
    const css = read(path.join(SRC, "app", "globals.css"));
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline: 3px solid/);
    expect(css).toContain("prefers-reduced-motion: no-preference");
    expect(read(path.join(SRC, "styles", "tokens.css"))).toMatch(/prefers-reduced-motion: reduce[\s\S]*--scv-duration: 0ms/);
  });

  it("has localized not-found and error boundaries for every public route", () => {
    expect(existsSync(path.join(SRC, "app", "[locale]", "not-found.tsx"))).toBe(true);
    expect(existsSync(path.join(SRC, "app", "[locale]", "error.tsx"))).toBe(true);
    expect(read(path.join(SRC, "app", "[locale]", "not-found.tsx"))).toMatch(/<h1[\s>]/);
    expect(read(path.join(SRC, "app", "[locale]", "error.tsx"))).toMatch(/<h1[\s>]/);
  });
});

const h = createElement;
const withIntl = (ui: ReactNode) =>
  h(NextIntlClientProvider, { locale: "en", messages: { common, accessibility, errors, support }, timeZone: "Asia/Kolkata", children: ui });

/** Visible form controls without an accessible name. */
function unlabelled(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>("input, select, textarea"))
    .filter((el) => !(el instanceof HTMLInputElement && el.type === "hidden"))
    .filter((el) => {
      const labelled = (el as HTMLInputElement).labels?.length || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby");
      return !labelled;
    })
    .map((el) => `${el.tagName.toLowerCase()}[name=${el.getAttribute("name") ?? el.id}]`);
}

describe("public and shared forms: every control is labelled", () => {
  const finderLabels = {
    pinLabel: "PIN code",
    pinHint: "6 digits",
    serviceLegend: "What do you need?",
    submit: "Show providers",
    submitting: "Opening",
    noSignIn: "No sign-in",
    errors: { pinRequired: "a", pinInvalid: "b", serviceRequired: "c" },
  };
  const searchLabels = {
    query: { label: "Doctor, speciality or symptom", loading: "l", empty: "e", error: "x", unavailable: "u", count: "#" },
    location: "City or PIN code",
    locationHint: "hint",
    locationPlaceholder: "p",
    submit: "Search doctors",
    submitting: "s",
  };
  const faqLabels = {
    searchLabel: "Search questions",
    searchHint: "h",
    results: { zero: "0", one: "1", other: "#" },
    noResultsTitle: "n",
    noResultsBody: "b",
    clear: "Clear",
    categories: { general: "G", services: "S", booking: "B", payments: "P", account: "A", providers: "R" },
  };

  it.each([
    ["ServiceFinder", () => h(ServiceFinder, { labels: finderLabels })],
    ["DoctorSearch", () => h(DoctorSearch, { labels: searchLabels })],
    ["FaqSearch", () => h(FaqSearch, { entries: [{ id: "x", category: "services", q: "Q", a: "A" }], labels: faqLabels })],
    ["SupportTicketForm", () => h(SupportTicketForm, { bookings: [{ id: "b1", label: "Booking 1" }], onSubmit: vi.fn() })],
    [
      "PhoneInput + OTPInput",
      () =>
        h(
          "div",
          null,
          h("label", { htmlFor: "m" }, "Mobile"),
          h(PhoneInput, { id: "m", value: "", onValueChange: vi.fn() }),
          h("label", { htmlFor: "o" }, "Code"),
          h(OTPInput, { id: "o", value: "", onValueChange: vi.fn() }),
        ),
    ],
  ])("%s", (_name, make) => {
    const { container } = render(withIntl(make()));
    expect(unlabelled(container)).toEqual([]);
  });
});

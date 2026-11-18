// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import accessibility from "@/messages/en/accessibility.json";
import common from "@/messages/en/common.json";
import errors from "@/messages/en/errors.json";
import { doctorSearchHref } from "@/components/public/finder";
import { AccountActions } from "@/components/shared/account-actions";
import { loginHref, ROLE_NAV, ROLES, roleDashboardHref, roleNavHref, safeReturnPath } from "@/components/shared/role-nav";
import { SearchCombobox, type SuggestResult } from "@/components/shared/search-combobox";
import { flattenSuggestions, moveActive, normalizeQuery } from "@/components/shared/search-combobox-logic";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/about",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ locale: "en" }),
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
  notFound: vi.fn(),
}));

afterEach(cleanup);

const h = createElement;
const withIntl = (ui: ReactNode) =>
  h(NextIntlClientProvider, { locale: "en", messages: { common, accessibility, errors }, timeZone: "Asia/Kolkata", children: ui });

describe("role navigation config", () => {
  it("covers all six roles, starts with the dashboard and has unique paths", () => {
    expect(Object.keys(ROLE_NAV).sort()).toEqual([...ROLES].sort());
    for (const role of ROLES) {
      const items = ROLE_NAV[role];
      expect(items[0].key).toBe("dashboard");
      expect(new Set(items.map((i) => i.path)).size).toBe(items.length);
      expect(items.filter((i) => i.primary).length).toBeLessThanOrEqual(5);
      for (const i of items) {
        expect(i.path).toMatch(/^\/[a-z-]+$/);
        expect(common.roleNav[i.key], `${role}:${i.key}`).toBeTruthy();
      }
    }
    expect(roleDashboardHref("lab")).toBe("/lab/dashboard");
    expect(roleNavHref("doctor", ROLE_NAV.doctor[2])).toBe("/doctor/visits");
  });

  it("only passes safe, PHI-free return paths to sign-in", () => {
    expect(safeReturnPath("/en/how-it-works?x=1#y")).toBe("/en/how-it-works");
    for (const bad of ["//evil.test", "https://evil.test", "/\\evil", "/a%2f%2fb", "/login", "/", "x", "/a b", `/${"a".repeat(201)}`, "/a\u0001"]) {
      expect(safeReturnPath(bad), bad).toBeUndefined();
    }
    expect(loginHref("/en/faq")).toBe("/login?next=%2Fen%2Ffaq");
    expect(loginHref("//evil")).toBe("/login");
  });
});

describe("doctor search URL", () => {
  it("puts query and coarse location in the URL, PIN when it is one", () => {
    expect(doctorSearchHref({ q: " fever  ", location: "500001" })).toBe("/doctors?q=fever&pin=500001");
    expect(doctorSearchHref({ q: "Cardiologist", location: "Hyderabad" })).toBe("/doctors?q=Cardiologist&city=Hyderabad");
    expect(doctorSearchHref({ q: "", location: "" })).toBe("/doctors");
    expect(doctorSearchHref({ location: "५००००१" })).toBe("/doctors?pin=500001");
    expect(doctorSearchHref({ location: '<script>"x' })).toBe("/doctors?city=script+x");
    expect(doctorSearchHref({ q: "fever <b>", location: "1" })).toBe("/doctors?q=fever+b");
    expect(doctorSearchHref({ q: "జ్వరం", location: "హైదరాబాద్" })).toBe(`/doctors?q=${encodeURIComponent("జ్వరం")}&city=${encodeURIComponent("హైదరాబాద్")}`);
    expect(doctorSearchHref({ q: "a".repeat(120) })).toBe(`/doctors?q=${"a".repeat(80)}`);
  });
});

describe("combobox logic", () => {
  it("wraps active option movement and normalizes queries", () => {
    expect(moveActive(-1, 1, 3)).toBe(0);
    expect(moveActive(-1, -1, 3)).toBe(2);
    expect(moveActive(2, 1, 3)).toBe(0);
    expect(moveActive(0, 1, 0)).toBe(-1);
    expect(normalizeQuery("  a ")).toBeNull();
    expect(normalizeQuery(" జ్వ  రం ")).toBe("జ్వ రం");
    expect(flattenSuggestions([{ id: "a", label: "A", items: [{ id: "1", label: "x" }] }, { id: "b", label: "B", items: [] }])).toHaveLength(1);
  });
});

describe("SearchCombobox", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const labels = {
    label: "Doctor, speciality or symptom",
    loading: "Loading",
    empty: "No suggestions",
    error: "Suggestions could not load",
    unavailable: "Suggestions are not available yet",
    count: "# suggestions",
  };
  const groups: SuggestResult = {
    ok: true,
    data: [
      { id: "specialities", label: "Specialities", items: [{ id: "s1", label: "Cardiology" }] },
      { id: "doctors", label: "Doctors", items: [{ id: "d1", label: "Dr. Fixture (synthetic)", href: "/doctors/d1" }] },
    ],
  };

  it("debounces, exposes ARIA combobox state and supports keyboard selection", async () => {
    const load = vi.fn().mockResolvedValue(groups);
    const onSelect = vi.fn();
    render(withIntl(h("form", null, h(SearchCombobox, { labels, loadSuggestions: load, onSelect }))));
    const input = screen.getByRole("combobox", { name: labels.label });
    fireEvent.change(input, { target: { value: "car" } });
    fireEvent.change(input, { target: { value: "card" } });
    await act(async () => vi.advanceTimersByTime(300));
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][0]).toBe("card");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.getByRole("group", { name: "Doctors" })).toBeTruthy();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[1].id);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "d1" }));
    expect((input as HTMLInputElement).value).toBe("Dr. Fixture (synthetic)");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows gated and error states honestly and closes on Escape", async () => {
    const load = vi.fn().mockResolvedValueOnce({ ok: false, error: { code: "gated" } }).mockRejectedValueOnce(new Error("x"));
    render(withIntl(h(SearchCombobox, { labels, loadSuggestions: load })));
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "fever" } });
    await act(async () => vi.advanceTimersByTime(300));
    expect(screen.getAllByText(labels.unavailable).length).toBeGreaterThan(0);
    fireEvent.change(input, { target: { value: "fever x" } });
    await act(async () => vi.advanceTimersByTime(300));
    expect(screen.getAllByText(labels.error).length).toBeGreaterThan(0);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(input, { key: "Escape" });
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("is a plain search input without a suggestion source", () => {
    render(withIntl(h(SearchCombobox, { labels })));
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("searchbox", { name: labels.label }).getAttribute("name")).toBe("q");
  });
});

describe("AccountActions", () => {
  it("signed out: sign in with a safe return path and create account", () => {
    render(withIntl(h(AccountActions, { account: null, variant: "desktop" })));
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/en/login?next=%2Fabout");
    expect(screen.getByRole("link", { name: "Create account" }).getAttribute("href")).toBe("/en/signup");
  });

  it("signed in: role dashboard link and a POST sign-out, no sign-in link", () => {
    render(
      withIntl(
        h(AccountActions, {
          account: { displayName: "Fixture Patient A", workspaces: [{ role: "patient", href: "/patient/dashboard" }], signOutAction: "/api/auth/sign-out" },
          variant: "desktop",
        }),
      ),
    );
    expect(screen.getByRole("link", { name: "My dashboard" }).getAttribute("href")).toBe("/en/patient/dashboard");
    const signOut = screen.getByRole("button", { name: "Sign out" });
    expect(signOut.closest("form")?.getAttribute("method")).toBe("post");
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("loading: reserves space without showing either state", () => {
    const { container } = render(withIntl(h(AccountActions, { account: undefined, variant: "desktop" })));
    expect(container.querySelector("a,button")).toBeNull();
  });
});

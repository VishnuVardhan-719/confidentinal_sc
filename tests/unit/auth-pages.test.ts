import { createElement } from "react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  usePathname: () => "/sign-in",
  useSearchParams: () => new URLSearchParams(),
}));

import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";
import AuthLayout from "@/app/(auth)/layout";
import SignInPage from "@/app/(auth)/sign-in/page";
import SignOutPage from "@/app/(auth)/sign-out/page";
import SignUpPage from "@/app/(auth)/sign-up/page";

const html = (el: ReactElement) => renderToStaticMarkup(el);
const submitOf = (out: string) => /<button[^>]*type="submit"[^>]*>/.exec(out)?.[0] ?? "";

describe("sign-in", () => {
  const out = html(createElement(SignInPage));

  it("asks for email and password with the right autocomplete", () => {
    expect(out).toMatch(/type="email"[^>]*autoComplete="email"/);
    expect(out).toContain('autoComplete="current-password"');
    expect(out).not.toContain('type="tel"');
  });
  it("has a working submit (posting from script, not a form action)", () => {
    expect(submitOf(out)).not.toContain('disabled=""');
    expect(out).not.toMatch(/<form[^>]*\b(action|method)=/);
    expect(out).toContain("noValidate");
  });
  it("shows no demo accounts or shared passwords", () => {
    expect(out).not.toMatch(/demo/i);
    expect(out).not.toMatch(/password for all/i);
  });
});

describe("sign-up", () => {
  const out = html(createElement(SignUpPage));

  it("asks only for what the signup API accepts", () => {
    const names = [...out.matchAll(/<input[^>]*name="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(names).toEqual(["email", "password"]);
    expect(out).toContain('autoComplete="new-password"');
    expect(out).toContain("At least 12 characters");
  });
  it("never offers an admin account", () => {
    expect(out).not.toMatch(/value="admin"/i);
  });
});

describe("forgot password", () => {
  const out = html(createElement(ForgotPasswordPage));

  it("keeps the submit disabled and explains that reset is not connected", () => {
    const submit = submitOf(out);
    expect(submit).toContain('disabled=""');
    const noteId = /aria-describedby="([^"]+)"/.exec(submit)?.[1];
    expect(noteId).toBeTruthy();
    expect(out).toMatch(new RegExp(`id="${noteId}"[^>]*>[\\s\\S]*?not available online yet`));
  });
});

describe("sign-out", () => {
  it("renders a session check while the tab session is read", () => {
    expect(html(createElement(SignOutPage))).toContain("Checking your session");
  });
});

describe("auth copy guard", () => {
  const all = [SignInPage, SignUpPage, ForgotPasswordPage, SignOutPage]
    .map((page) => html(createElement(page)))
    .concat(html(createElement(AuthLayout, null, "x")))
    .join(" ")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase();

  it("makes no price, rating, coverage, availability, verified or paid claims", () => {
    const banned = [/₹\s?\d/, /\brs\.?\s?\d/, /\brupees?\s+\d/, /\bratings?\b/, /\bstars?\b/, /\btestimonials?\b/, /reviews\b/,
      /\bverified\b/, /\bpaid\b/, /available now/, /\beta\b/, /\d+\s?min(ute)?s?\b/, /24\s?[/x]\s?7/, /near you/, /\bguarantee/,
      /\bsecure(ly)?\b/, /encrypted/];
    for (const re of banned) expect(all, String(re)).not.toMatch(re);
  });

  it("keeps the emergency number reachable without an account", () => {
    expect(html(createElement(AuthLayout, null, "x"))).toContain('href="tel:112"');
  });
});

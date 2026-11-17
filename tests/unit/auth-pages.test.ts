import { createElement } from "react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SignInPage from "@/app/(auth)/sign-in/page";
import SignUpPage from "@/app/(auth)/sign-up/page";
import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";
import VerifyPage from "@/app/(auth)/verify/page";
import AuthLayout from "@/app/(auth)/layout";
import { AUTH_CONNECTED } from "@/app/(auth)/_lib/connection";
import { roleOptions } from "@/app/(auth)/_components/sign-up-form";
import { toOtpDigits } from "@/app/(auth)/_components/verify-form";

const render = (page: () => ReactElement) => renderToStaticMarkup(createElement(page));

const pages = { SignInPage, SignUpPage, ForgotPasswordPage, VerifyPage };

describe("auth shells are not connected", () => {
  it("auth stays disconnected until I01 provides a real backend", () => {
    expect(AUTH_CONNECTED).toBe(false);
  });

  it.each(Object.entries(pages))("%s: submit is disabled and explained, with a polite status region", (_, page) => {
    const out = render(page);
    const submit = /<button[^>]*type="submit"[^>]*>/.exec(out)?.[0] ?? "";
    expect(submit).toContain("disabled");
    const noteId = /aria-describedby="([^"]+)"/.exec(submit)?.[1];
    expect(noteId).toBeTruthy();
    expect(out).toMatch(new RegExp(`id="${noteId}"[^>]*>[\\s\\S]*?is not connected yet`));
    expect(out).toContain("nothing is sent or stored");
    expect(out).toMatch(/role="status"[^>]*aria-live="polite"/);
  });

  it.each(Object.entries(pages))("%s: forms have no action or method, so nothing can post", (_, page) => {
    const out = render(page);
    expect(out).not.toMatch(/<form[^>]*\b(action|method)=/);
    expect(out).toContain("noValidate");
  });

  it("sign-in says so in the brief's words", () => {
    expect(render(SignInPage)).toContain("Sign-in is not connected yet.");
  });
});

describe("sign-up role choice", () => {
  const out = render(SignUpPage);

  it("offers patient, doctor, lab, ambulance and caretaker as radios, and never admin", () => {
    const values = [...out.matchAll(/<input type="radio"[^>]*name="role"[^>]*value="([^"]+)"/g)].map((m) => m[1]);
    expect(values).toEqual(["patient", "doctor", "lab", "ambulance", "caretaker"]);
    expect(roleOptions.map((r) => r.value)).not.toContain("admin");
    expect(out).not.toMatch(/value="admin"/i);
  });

  it("wires autocomplete for name, phone, email and a new password", () => {
    for (const ac of ["name", "tel", "email", "new-password"]) expect(out).toContain(`autoComplete="${ac}"`);
  });
});

describe("verify (OTP)", () => {
  const out = render(VerifyPage);

  it("uses a single numeric one-time-code input", () => {
    const input = /<input[^>]*autoComplete="one-time-code"[^>]*>/.exec(out)?.[0] ?? "";
    expect(input).toContain('inputMode="numeric"');
    expect(input).toContain('pattern="[0-9]{6}"');
    expect(input).toContain("transition-none!");
    expect(out.match(/<input/g)).toHaveLength(1);
  });

  it("states honestly that no code was sent", () => {
    expect(out).toContain("No code has been sent");
  });

  it("keeps only digits, up to six", () => {
    expect(toOtpDigits("123 456")).toBe("123456");
    expect(toOtpDigits("12-34-56-78")).toBe("123456");
    expect(toOtpDigits("ab")).toBe("");
  });
});

describe("sign-in", () => {
  it("defaults to the mobile method with tel autocomplete", () => {
    const out = render(SignInPage);
    expect(out).toMatch(/checked="" value="phone"/);
    expect(out).toMatch(/type="tel"[^>]*autoComplete="tel"/);
  });
});

describe("auth copy guard", () => {
  const all = [...Object.values(pages).map(render), renderToStaticMarkup(createElement(AuthLayout, null, "x"))]
    .join(" ")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase();

  it("makes no price, rating, coverage, availability, verified or paid claims", () => {
    const banned = [/₹/, /\brs\.?\s?\d/, /\brupees?\b/, /\bratings?\b/, /\bstars?\b/, /\btestimonials?\b/, /reviews\b/,
      /\bverified\b/, /\bpaid\b/, /available now/, /\beta\b/, /\d+\s?min(ute)?s?\b/, /24\s?[/x]\s?7/, /near you/, /\bguarantee/,
      /\bsecure(ly)?\b/, /encrypted/];
    for (const re of banned) expect(all, String(re)).not.toMatch(re);
  });

  it("keeps the emergency number reachable without an account", () => {
    expect(renderToStaticMarkup(createElement(AuthLayout, null, "x"))).toContain('href="tel:112"');
  });
});

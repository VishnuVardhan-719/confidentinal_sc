import { createElement } from "react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";
import VerifyPage from "@/app/(auth)/verify/page";
import AuthLayout from "@/app/(auth)/layout";
import { AUTH_CONNECTED } from "@/app/(auth)/_lib/connection";
import { SignInForm } from "@/app/(auth)/_components/sign-in-form";
import { SignUpForm, roleOptions } from "@/app/(auth)/_components/sign-up-form";
import { toOtpDigits } from "@/app/(auth)/_components/verify-form";
import { SIGNUP_ROLES } from "@/lib/validation/auth";

const html = (el: ReactElement) => renderToStaticMarkup(el);

const screens: Record<string, () => string> = {
  "sign-in": () => html(createElement(SignInForm)),
  "sign-up (patient)": () => html(createElement(SignUpForm, { initialRole: "patient" })),
  "forgot-password": () => html(createElement(ForgotPasswordPage)),
  verify: () => html(createElement(VerifyPage)),
};

describe("auth shells are not connected (demo mode off)", () => {
  it("auth stays disconnected until I01 provides a real backend", () => {
    expect(AUTH_CONNECTED).toBe(false);
  });

  it.each(Object.entries(screens))("%s: submit is disabled and explained, with a polite status region", (_, render) => {
    const out = render();
    const submit = /<button[^>]*type="submit"[^>]*>/.exec(out)?.[0] ?? "";
    expect(submit).toContain('disabled=""');
    const noteId = /aria-describedby="([^"]+)"/.exec(submit)?.[1];
    expect(noteId).toBeTruthy();
    expect(out).toMatch(new RegExp(`id="${noteId}"[^>]*>[\\s\\S]*?is not connected yet`));
    expect(out).toContain("nothing is sent or stored");
    expect(out).toMatch(/role="status"[^>]*aria-live="polite"/);
  });

  it.each(Object.entries(screens))("%s: forms have no action or method, so nothing can post", (_, render) => {
    const out = render();
    expect(out).not.toMatch(/<form[^>]*\b(action|method)=/);
    expect(out).toContain("noValidate");
  });

  it("sign-in says so in the brief's words", () => {
    expect(screens["sign-in"]()).toContain("Sign-in is not connected yet.");
  });
});

describe("sign-up role choice", () => {
  const blank = html(createElement(SignUpForm));

  it("offers patient, doctor, lab, ambulance and caretaker as radios, and never admin", () => {
    const values = [...blank.matchAll(/<input type="radio"[^>]*name="role"[^>]*value="([^"]+)"/g)].map((m) => m[1]);
    expect(values).toEqual(["patient", "doctor", "lab", "ambulance", "caretaker"]);
    expect(roleOptions.map((r) => r.value)).not.toContain("admin");
    expect(blank).not.toMatch(/value="admin"/i);
  });

  it("shows no details form until a type is chosen", () => {
    expect(blank).not.toContain("<form");
    expect(blank).toContain("Choose an account type");
  });

  const expected: Record<(typeof SIGNUP_ROLES)[number], string[]> = {
    patient: ["fullName", "phone", "email", "dateOfBirth", "city", "preferredLanguage", "emergencyContactName", "emergencyContactPhone"],
    doctor: ["fullName", "speciality", "registrationNumber", "yearsExperience", "clinicCity", "consultationModes", "languages", "feePaise"],
    lab: ["labName", "licenceNumber", "city", "services", "opensAt", "closesAt", "contactName", "contactPhone"],
    ambulance: ["operatorName", "registrationNumber", "baseCity", "vehicleCount", "vehicleType", "contactPhone", "scheduledOnly"],
    caretaker: ["fullName", "phone", "city", "yearsExperience", "languages", "patientLinkCode"],
  };

  it.each(SIGNUP_ROLES)("%s asks for its own details", (role) => {
    const out = html(createElement(SignUpForm, { initialRole: role }));
    const names = new Set([...out.matchAll(/<(?:input|select)[^>]*name="([^"]+)"/g)].map((m) => m[1]).filter((n) => n !== "role"));
    expect([...names].sort()).toEqual([...expected[role]].sort());
    expect(out).toMatch(new RegExp(`checked="" value="${role}"`));
  });

  it("states plainly that ambulance is scheduled, non-emergency only", () => {
    const out = html(createElement(SignUpForm, { initialRole: "ambulance" }));
    expect(out).toContain("Scheduled, non-emergency transfers only.");
    expect(out).toContain("does not take emergency calls");
  });

  it("patient form wires autocomplete for name, phone, email and birthday", () => {
    const out = html(createElement(SignUpForm, { initialRole: "patient" }));
    for (const ac of ["name", "tel", "email", "bday"]) expect(out).toContain(`autoComplete="${ac}"`);
  });

  it("demo mode enables the submit and labels it as demo-only", () => {
    const out = html(createElement(SignUpForm, { initialRole: "doctor", demo: true }));
    const submit = /<button[^>]*type="submit"[^>]*>/.exec(out)?.[0] ?? "";
    expect(submit).not.toContain('disabled=""');
    expect(out).toContain("Demo mode.");
    expect(out).toContain("no payment is taken");
  });
});

describe("verify (OTP)", () => {
  const out = html(createElement(VerifyPage));

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
    const out = screens["sign-in"]();
    expect(out).toMatch(/checked="" value="phone"/);
    expect(out).toMatch(/type="tel"[^>]*autoComplete="tel"/);
  });
});

describe("auth copy guard", () => {
  const all = [
    ...Object.values(screens).map((r) => r()),
    ...SIGNUP_ROLES.map((role) => html(createElement(SignUpForm, { initialRole: role }))),
    html(createElement(AuthLayout, null, "x")),
  ]
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

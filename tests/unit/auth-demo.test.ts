import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, { value: string; options?: Record<string, unknown> }>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => jar.set(name, { value, options }),
    delete: (name: string) => jar.delete(name),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  },
}));

import { DEMO_LABEL, DEMO_USERS } from "@/lib/demo/data";
import { DEMO_COOKIE, DEMO_HOME, demoSessionFrom, isDemoMode, parseDemoRole } from "@/lib/demo/auth-core";
import { getDemoSession } from "@/lib/demo/auth";
import { endDemoSession, startDemoSession } from "@/lib/demo/auth-actions";
import SignInPage from "@/app/(auth)/sign-in/page";

const ON = { NEXT_PUBLIC_DEMO_MODE: "true" };
const form = (role: string) => {
  const f = new FormData();
  f.set("role", role);
  return f;
};
const redirectOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { to?: string }).to ?? String(e);
  }
};

beforeEach(() => jar.clear());
afterEach(() => vi.unstubAllEnvs());

describe("demo mode gate", () => {
  it("is off unless NEXT_PUBLIC_DEMO_MODE is exactly 'true'", () => {
    expect(isDemoMode({})).toBe(false);
    expect(isDemoMode({ NEXT_PUBLIC_DEMO_MODE: "1" })).toBe(false);
    expect(isDemoMode({ NEXT_PUBLIC_DEMO_MODE: "TRUE" })).toBe(false);
    expect(isDemoMode(ON)).toBe(true);
  });

  it("returns no session when demo mode is off, even with a valid cookie", () => {
    expect(demoSessionFrom("admin", {})).toBeNull();
  });
});

describe("role allowlist", () => {
  it("accepts the six DEMO_USERS roles and nothing else", () => {
    for (const u of DEMO_USERS) expect(parseDemoRole(u.role)).toBe(u.role);
    for (const bad of ["", "Admin", "root", "admin ", "patient;admin", null, undefined, 1]) expect(parseDemoRole(bad)).toBeNull();
  });

  it("maps every role to a dashboard", () => {
    expect(DEMO_HOME).toEqual({
      patient: "/dashboard", doctor: "/provider", lab: "/provider", ambulance: "/provider", caretaker: "/provider", admin: "/admin",
    });
  });

  it("builds a labelled demo session from a cookie value", () => {
    expect(demoSessionFrom("doctor", ON)).toEqual({
      role: "doctor", name: "Dr. Demo Asha (Demo)", email: "doctor@demo.invalid", home: "/provider", demo: true,
    });
    expect(demoSessionFrom("forged", ON)).toBeNull();
  });
});

describe("server actions", () => {
  it("refuses demo sign-in when demo mode is off and sets no cookie", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "");
    expect(await startDemoSession({ error: null }, form("patient"))).toEqual({ error: "Demo mode is switched off on this site." });
    expect(jar.size).toBe(0);
  });

  it("rejects an unknown role", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    const r = await startDemoSession({ error: null }, form("superuser"));
    expect(r.error).toMatch(/does not exist/);
    expect(jar.size).toBe(0);
  });

  it.each(DEMO_USERS.map((u) => u.role))("signs in as %s with an httpOnly lax cookie and redirects home", async (role) => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    expect(await redirectOf(startDemoSession({ error: null }, form(role)))).toBe(DEMO_HOME[role]);
    const c = jar.get(DEMO_COOKIE);
    expect(c?.value).toBe(role);
    expect(c?.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 28800 });
    expect((await getDemoSession())?.role).toBe(role);
  });

  it("sign-out clears the cookie and lands on /sign-out", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    jar.set(DEMO_COOKIE, { value: "patient" });
    expect(await redirectOf(endDemoSession())).toBe("/sign-out");
    expect(jar.has(DEMO_COOKIE)).toBe(false);
    expect(await getDemoSession()).toBeNull();
  });
});

describe("sign-in demo panel", () => {
  it("is absent when demo mode is off", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "");
    const out = renderToStaticMarkup(createElement(SignInPage));
    expect(out).not.toContain("Try demo as");
    expect(out).not.toContain(DEMO_LABEL);
  });

  it("offers all six roles with a visible demo badge when on", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    const out = renderToStaticMarkup(createElement(SignInPage));
    expect(out).toContain(DEMO_LABEL);
    const roles = [...out.matchAll(/<button[^>]*value="([^"]+)"[^>]*name="role"/g)].map((m) => m[1]);
    expect(roles).toEqual(DEMO_USERS.map((u) => u.role));
    expect(out).toContain("no payment is taken");
    expect(out).toContain("Real admin accounts are invite-only");
  });
});

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
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));

import { DEMO_LABEL, DEMO_USERS } from "@/lib/demo/data";
import {
  DEMO_COOKIE,
  DEMO_HOME,
  DEMO_PROFILE_COOKIE,
  ROUTE_ROLES,
  SIGNUP_HOME,
  canAccess,
  decodeDemoProfile,
  demoSessionFrom,
  destinationFor,
  encodeDemoProfile,
  isDemoMode,
  parseDemoRole,
  safeNext,
} from "@/lib/demo/auth-core";
import { getDemoSession, requireDemoRole } from "@/lib/demo/auth";
import { createDemoAccount, endDemoSession, startDemoSession } from "@/lib/demo/auth-actions";
import { DemoPanel } from "@/app/(auth)/_components/demo-panel";

const ON = { NEXT_PUBLIC_DEMO_MODE: "true" };
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
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

describe("roles, homes and route access", () => {
  it("accepts the six DEMO_USERS roles and nothing else", () => {
    for (const u of DEMO_USERS) expect(parseDemoRole(u.role)).toBe(u.role);
    for (const bad of ["", "Admin", "root", "admin ", "patient;admin", null, undefined, 1]) expect(parseDemoRole(bad)).toBeNull();
  });

  it("maps every role to its own home, and new providers to onboarding", () => {
    expect(DEMO_HOME).toEqual({
      patient: "/dashboard", doctor: "/provider", lab: "/provider", ambulance: "/provider", caretaker: "/caretaker", admin: "/admin",
    });
    expect(SIGNUP_HOME).toEqual({
      patient: "/dashboard", doctor: "/provider/onboarding", lab: "/provider/onboarding", ambulance: "/provider/onboarding", caretaker: "/caretaker",
    });
    expect(SIGNUP_HOME).not.toHaveProperty("admin");
  });

  it("every role can open its own home", () => {
    for (const u of DEMO_USERS) expect(canAccess(u.role, DEMO_HOME[u.role]), u.role).toBe(true);
  });

  it.each([
    ["patient", "/dashboard", true], ["patient", "/book?provider=demo-dr-1", true], ["patient", "/admin", false],
    ["patient", "/provider", false], ["doctor", "/provider/onboarding", true], ["caretaker", "/provider", false],
    ["caretaker", "/caretaker", true], ["admin", "/admin", true], ["admin", "/dashboard", false],
    ["lab", "/account", true], ["patient", "/categories/doctor", true], ["doctor", "/administrator", true],
  ] as const)("%s → %s is %s", (role, path, ok) => {
    expect(canAccess(role, path)).toBe(ok);
  });

  it("lists the protected routes", () => {
    expect(Object.keys(ROUTE_ROLES).sort()).toEqual(["/account", "/admin", "/book", "/caretaker", "/dashboard", "/provider"]);
  });
});

describe("?next= handling", () => {
  it.each([
    ["/book?provider=demo-dr-1&slot=x", "/book?provider=demo-dr-1&slot=x"],
    ["/admin", "/admin"],
    ["/dashboard#visits", "/dashboard"],
  ])("keeps same-site path %j", (raw, out) => expect(safeNext(raw)).toBe(out));

  it.each([
    "https://evil.example/", "//evil.example", "/\\evil.example", "\\\\evil", "javascript:alert(1)", "dashboard", "",
    "/sign-in?next=/admin", "/sign-out", "/sign-up", "/%0d%0aSet-Cookie:x", "/a\nb", "/" + "a".repeat(400), null, 42,
  ])("rejects %j", (raw) => {
    const out = safeNext(raw);
    if (typeof raw === "string" && raw.startsWith("/%0d")) expect(out).toBe("/%0d%0aSet-Cookie:x"); // encoded stays inert in a path
    else expect(out).toBeNull();
  });

  it("honours next only when the role may open it", () => {
    expect(destinationFor("admin", "/admin")).toBe("/admin");
    expect(destinationFor("patient", "/admin")).toBe("/dashboard");
    expect(destinationFor("patient", "https://evil.example")).toBe("/dashboard");
    expect(destinationFor("doctor", null)).toBe("/provider");
  });
});

describe("profile cookie", () => {
  it("round-trips name and city and rejects junk", () => {
    expect(decodeDemoProfile(encodeDemoProfile({ role: "doctor", name: "Test Doctor", city: "Hyderabad" }))).toEqual({
      role: "doctor", name: "Test Doctor", city: "Hyderabad",
    });
    for (const bad of [undefined, "", "{", "[]", '{"role":"admin2","name":"x"}', '{"role":"doctor","name":""}', "x".repeat(500)])
      expect(decodeDemoProfile(bad)).toBeNull();
  });

  it("uses the typed name only for the matching role", () => {
    const profile = encodeDemoProfile({ role: "doctor", name: "Test Doctor" });
    expect(demoSessionFrom("doctor", ON, profile)).toMatchObject({ name: "Test Doctor", custom: true });
    expect(demoSessionFrom("patient", ON, profile)).toMatchObject({ name: "Demo Patient One", custom: false });
  });
});

describe("demo sign-in action", () => {
  it("refuses when demo mode is off and sets no cookie", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "");
    expect(await startDemoSession({ error: null }, form({ role: "patient" }))).toEqual({ error: "Demo mode is switched off on this site." });
    expect(jar.size).toBe(0);
  });

  it("rejects an unknown role", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    const r = await startDemoSession({ error: null }, form({ role: "superuser" }));
    expect(r.error).toMatch(/does not exist/);
    expect(jar.size).toBe(0);
  });

  it.each(DEMO_USERS.map((u) => u.role))("signs in as %s with an httpOnly lax cookie and redirects home", async (role) => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    expect(await redirectOf(startDemoSession({ error: null }, form({ role })))).toBe(DEMO_HOME[role]);
    const c = jar.get(DEMO_COOKIE);
    expect(c?.value).toBe(role);
    expect(c?.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 28800 });
    expect((await getDemoSession())?.role).toBe(role);
  });

  it("follows a permitted next and ignores an off-site one", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    expect(await redirectOf(startDemoSession({ error: null }, form({ role: "patient", next: "/book?provider=demo-dr-1" })))).toBe(
      "/book?provider=demo-dr-1",
    );
    expect(await redirectOf(startDemoSession({ error: null }, form({ role: "patient", next: "//evil.example" })))).toBe("/dashboard");
  });

  it("clears a stale sign-up profile", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    jar.set(DEMO_PROFILE_COOKIE, { value: encodeDemoProfile({ role: "patient", name: "Old Name" }) });
    await redirectOf(startDemoSession({ error: null }, form({ role: "patient" })));
    expect(jar.has(DEMO_PROFILE_COOKIE)).toBe(false);
  });
});

describe("demo sign-up action", () => {
  const doctor = {
    role: "doctor", fullName: "Test Doctor", speciality: "Paediatrics", registrationNumber: "TSMC/1", yearsExperience: "5",
    clinicCity: "Hyderabad", consultationModes: ["clinic"], languages: ["Telugu"], feePaise: "600",
  };

  it("is refused when demo mode is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "");
    expect(await createDemoAccount(doctor)).toMatchObject({ ok: false });
    expect(jar.size).toBe(0);
  });

  it("re-validates on the server and returns field errors", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    const r = await createDemoAccount({ ...doctor, feePaise: "free", registrationNumber: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(["feePaise", "registrationNumber"]);
    expect(jar.size).toBe(0);
  });

  it("never creates an admin", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    expect(await createDemoAccount({ ...doctor, role: "admin" })).toMatchObject({ ok: false });
    expect(jar.size).toBe(0);
  });

  it("starts a session for the role, keeps only name and city, and points providers at onboarding", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    expect(await createDemoAccount(doctor)).toEqual({ ok: true, home: "/provider/onboarding", name: "Test Doctor" });
    expect(jar.get(DEMO_COOKIE)?.value).toBe("doctor");
    const profile = jar.get(DEMO_PROFILE_COOKIE);
    expect(profile?.options).toMatchObject({ httpOnly: true, sameSite: "lax" });
    expect(JSON.parse(profile!.value)).toEqual({ role: "doctor", name: "Test Doctor", city: "Hyderabad" });
    expect(await getDemoSession()).toMatchObject({ role: "doctor", name: "Test Doctor", custom: true, home: "/provider" });
  });
});

describe("requireDemoRole", () => {
  it("sends a missing session to sign-in with next", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    expect(await redirectOf(requireDemoRole(["admin"], "/admin"))).toBe("/sign-in?next=%2Fadmin");
  });

  it("sends the wrong role to sign-in with next", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    jar.set(DEMO_COOKIE, { value: "patient" });
    expect(await redirectOf(requireDemoRole(["admin"], "/admin"))).toBe("/sign-in?next=%2Fadmin");
  });

  it("returns the session for an allowed role", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    jar.set(DEMO_COOKIE, { value: "caretaker" });
    expect(await requireDemoRole(["caretaker"], "/caretaker")).toMatchObject({ role: "caretaker", demo: true });
  });

  it("blocks everyone when demo mode is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "");
    jar.set(DEMO_COOKIE, { value: "admin" });
    expect(await redirectOf(requireDemoRole(["admin"], "/admin"))).toBe("/sign-in?next=%2Fadmin");
  });
});

describe("sign-out", () => {
  it("clears both cookies and lands on /sign-out", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    jar.set(DEMO_COOKIE, { value: "patient" });
    jar.set(DEMO_PROFILE_COOKIE, { value: encodeDemoProfile({ role: "patient", name: "X Y" }) });
    expect(await redirectOf(endDemoSession())).toBe("/sign-out");
    expect(jar.size).toBe(0);
    expect(await getDemoSession()).toBeNull();
  });
});

describe("demo panel", () => {
  it("offers all six roles with a visible demo badge", () => {
    const out = renderToStaticMarkup(createElement(DemoPanel));
    expect(out).toContain(DEMO_LABEL);
    const roles = [...out.matchAll(/<button[^>]*value="([^"]+)"[^>]*name="role"/g)].map((m) => m[1]);
    expect(roles).toEqual(DEMO_USERS.map((u) => u.role));
    expect(out).toContain("no payment is taken");
    expect(out).toContain("Real admin accounts are invite-only");
    expect(out).not.toContain('name="next"');
  });

  it("carries next as a hidden field", () => {
    const out = renderToStaticMarkup(createElement(DemoPanel, { next: "/admin" }));
    expect(out).toMatch(/<input type="hidden" name="next" value="\/admin"/);
  });
});

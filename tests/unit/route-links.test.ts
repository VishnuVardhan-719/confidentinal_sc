import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AUTH_ROUTES, PROVIDER_ROLES, PUBLIC_PAGES, SERVICES, signupHref } from "@/components/public/routes";
import { loginHref, ROLE_NAV, ROLES, roleDashboardHref, roleNavHref } from "@/components/shared/role-nav";

/**
 * Every internal href the UI can emit (header, footer, ROLE_NAV, landing and public pages) must
 * resolve to a real route under src/app/[locale], or be listed in PENDING with its owner. The
 * catch-all 404 route does not count as a match.
 */
const SRC = path.resolve(import.meta.dirname, "../../src");
const APP = path.join(SRC, "app", "[locale]");

/** Routes owned by other workstreams that are not on this branch yet. Key = route pattern prefix. */
const PENDING: Record<string, string> = {
  "/doctors": "fe2-c directory + doctor profile (feat/fe2-c, ex-fe-c2)",
  "/login": "fe2-b auth (feat/fe2-b)",
  "/signup": "fe2-b auth (feat/fe2-b)",
  "/patient": "patient workspace (fe2-b onboarding / fe2-c bookings)",
  "/doctor": "doctor workspace (feat/fe2-d)",
  "/lab": "lab workspace (feat/fe2-e)",
  "/ambulance": "ambulance workspace (feat/fe2-e)",
  "/caretaker": "caretaker workspace (feat/fe2-e)",
  "/admin": "admin console (feat/fe2-e)",
};

type Route = { segments: string[]; catchAll: boolean };

function collectRoutes(dir: string, segments: string[] = []): Route[] {
  const out: Route[] = [];
  const entries = readdirSync(dir);
  if (entries.some((f) => /^(page|route)\.tsx?$/.test(f))) {
    out.push({ segments, catchAll: segments.some((s) => s.startsWith("[...") || s.startsWith("[[...")) });
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    const isGroup = /^\(.*\)$/.test(name);
    out.push(...collectRoutes(full, isGroup ? segments : [...segments, name]));
  }
  return out;
}

const ROUTES = collectRoutes(APP).filter((r) => !r.catchAll);

function resolves(href: string): boolean {
  const parts = href.split(/[?#]/)[0].split("/").filter(Boolean);
  return ROUTES.some(
    (r) => r.segments.length === parts.length && r.segments.every((s, i) => (s.startsWith("[") ? parts[i].length > 0 : s === parts[i])),
  );
}

function pendingOwner(href: string): string | undefined {
  const p = href.split(/[?#]/)[0];
  const key = Object.keys(PENDING).find((k) => p === k || p.startsWith(`${k}/`));
  return key ? PENDING[key] : undefined;
}

/** href="/x", href: "/x", href={"/x"} and Link-style literals in source files. */
function hrefsInSource(): Map<string, string> {
  const found = new Map<string, string>();
  const literal = /href(?:=\{?|\s*:\s*)["'`](\/[^"'`\s{}$]*)["'`]/g;
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) {
        for (const m of readFileSync(full, "utf8").matchAll(literal)) {
          if (!m[1].startsWith("//")) found.set(m[1], path.relative(SRC, full));
        }
      }
    }
  };
  for (const dir of ["components/public", "components/shared", "app/[locale]"]) walk(path.join(SRC, dir));
  return found;
}

function allHrefs(): Map<string, string> {
  const hrefs = hrefsInSource();
  for (const p of PUBLIC_PAGES) hrefs.set(p, "PUBLIC_PAGES");
  for (const s of SERVICES) hrefs.set(s.href, "SERVICES");
  hrefs.set(AUTH_ROUTES.login, "AUTH_ROUTES");
  hrefs.set(AUTH_ROUTES.signup, "AUTH_ROUTES");
  hrefs.set(loginHref("/faq"), "loginHref");
  for (const role of PROVIDER_ROLES) hrefs.set(signupHref(role), "signupHref");
  for (const role of ROLES) {
    hrefs.set(roleDashboardHref(role), "roleDashboardHref");
    for (const item of ROLE_NAV[role]) hrefs.set(roleNavHref(role, item), `ROLE_NAV.${role}`);
  }
  return hrefs;
}

describe("internal links resolve to real routes", () => {
  const hrefs = allHrefs();

  it("collects links from every source", () => {
    expect(hrefs.size).toBeGreaterThan(60);
    for (const p of ["/about", "/emergency", "/doctors", "/how-it-works", "/patient/dashboard", "/admin/audit", "/privacy"]) {
      expect([...hrefs.keys()].some((h) => h.split("?")[0] === p), p).toBe(true);
    }
  });

  it("every link is a real route or a documented pending route", () => {
    const dead: string[] = [];
    const pending = new Map<string, string>();
    for (const [href, from] of hrefs) {
      if (resolves(href)) continue;
      const owner = pendingOwner(href);
      if (owner) pending.set(href.split("?")[0], owner);
      else dead.push(`${href} (from ${from})`);
    }
    const report = [...pending].sort().map(([h, o]) => `  ${h} -> ${o}`).join("\n");
    console.log(`[route-links] ${pending.size} pending routes:\n${report}`);
    expect(dead).toEqual([]);
  });

  it("does not mistake the 404 catch-all for a real route", () => {
    expect(resolves("/definitely-not-a-page")).toBe(false);
    expect(resolves("/stories/some-slug")).toBe(true);
    expect(resolves("/find")).toBe(true);
  });
});

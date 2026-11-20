import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * R9-C13 backend-connect dry run (docs/frontend/BACKEND_CONNECT_PLAN.md): every route an http adapter calls
 * (`src/modules/<module>/http*.ts`) must appear in docs/API_CONTRACTS.md, or be listed below with the backend
 * source that defines it. A new route therefore needs either a contract row or a reviewed exception.
 * GUARD_SRC points the scan at another exported src tree (e.g. feat/fe2-integration).
 */
const ROOT = path.resolve(import.meta.dirname, "../..");
const SRC = path.resolve(process.env.GUARD_SRC ?? path.join(ROOT, "src"));
const CONTRACTS = readFileSync(process.env.GUARD_CONTRACTS ?? path.join(ROOT, "docs/API_CONTRACTS.md"), "utf8");

/** `/api/a/${x}/b?${q}` and `/api/a/[id]/b` -> `/api/a/:id/b`; query and trailing `/` or `?` dropped. */
export function normalizeRoute(raw: string): string {
  return raw.replace(/\$\{[^}]*\}/g, ":id").replace(/\[[^\]]+\]/g, ":id").replace(/\?.*$/, "").replace(/\/+$/, "") || "/";
}

const contractRoutes = new Set([...CONTRACTS.matchAll(/`(?:GET|POST|PUT|PATCH|DELETE)\s+(\/api\/[^`\s]+)`/g)].map(m => normalizeRoute(m[1])));

/**
 * Routes used by an http adapter but not (yet) in API_CONTRACTS.md. Each value names the backend source.
 * BACKEND_STATUS.md (branch docs/backend-status) lists these under "Endpoints needing approval": add them to
 * API_CONTRACTS.md after owner approval, then delete the entry here.
 */
const NOT_IN_CONTRACTS: Record<string, string> = {
  "/api/auth/me": "I01 PR #1 (task/I01-auth-rls) GET",
  "/api/auth/signup": "I01 PR #1 POST, 202 { status: signup_received }",
  "/api/auth/login": "I01 PR #1 POST -> { accessToken, refreshToken, expiresAt }",
  "/api/auth/refresh": "I01 PR #1 POST { refreshToken }",
  "/api/auth/logout": "I01 PR #1 POST",
  "/api/auth/patient": "I01 PR #1 POST { policyVersion, consent: true } -> { patientId }",
  "/api/auth/invitations": "I01 PR #1 GET -> { invitations }",
  "/api/organizations/:id/members/accept": "I01 PR #1 POST -> { membershipId }",
  "/api/providers/:id/documents": "I02 PR #2 POST (private document metadata)",
  "/api/providers/:id/submit": "I02 PR #2 POST",
  "/api/providers/:id/documents/:id/signed-url": "I02 PR #2 POST; returns 503 by design until signed URLs are approved",
  "/api/catalog": "C01 PR #3 GET (public; API_CONTRACTS proposes /api/providers?category=&pin=)",
  "/api/catalog/:id": "C01 PR #3 GET (public; API_CONTRACTS proposes /api/providers/:id)",
  "/api/bookings/:id": "B01 PR #4 GET -> { booking }",
  "/api/bookings/:id/start": "B01 PR #4 POST { expectedVersion } -> { version }",
  "/api/bookings/:id/reschedule": "B01 PR #4 POST { expectedVersion, startAt } + Idempotency-Key -> 201 { id } (bookings/b01-http.ts, not enabled yet)",
  "/api/availability": "B01 PR #4 GET ?provider&service&date -> { slots, advisory } (bookings/b01-http.ts, not enabled yet)",
  "/api/patient/addresses": "B01 PR #4 POST address body -> { id } (patient/b01-http.ts, not enabled yet)",
};

/**
 * Adapters that build a path by concatenation or a `${action}` segment. Their literal is only a prefix, so the
 * expansions are listed here and the test checks each action word still appears in the file.
 */
const DYNAMIC: Record<string, { actions: string[]; routes: string[] }> = {
  "bookings/http.ts": { actions: ["accept", "decline", "cancel"], routes: ["/api/bookings/:id", "/api/bookings/:id/accept", "/api/bookings/:id/decline", "/api/bookings/:id/cancel"] },
  "doctor/http.ts": { actions: ["accept", "decline", "en-route", "arrive", "start"], routes: ["/api/bookings/:id/accept", "/api/bookings/:id/decline", "/api/bookings/:id/en-route", "/api/bookings/:id/arrive", "/api/bookings/:id/start"] },
};

type Call = { file: string; route: string };
function adapterCalls(): Call[] {
  const modules = path.join(SRC, "modules");
  if (!existsSync(modules)) return [];
  const calls: Call[] = [];
  for (const m of readdirSync(modules)) {
    const dir = path.join(modules, m);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir).filter(name => /http/.test(name) && name.endsWith(".ts"))) {
      const file = `${m}/${f}`;
      const text = readFileSync(path.join(dir, f), "utf8");
      const dynamic = DYNAMIC[file];
      if (dynamic) for (const route of dynamic.routes) calls.push({ file, route });
      for (const line of text.split("\n")) {
        if (/^\s*(\*|\/\/)/.test(line)) continue; // comments document routes; only code counts
        for (const lit of line.matchAll(/[`"'](\/api\/[^`"'\s]*)[`"']/g)) {
          if (lit[1].includes("${string}")) continue; // a TypeScript template-literal type, not a request
          const route = normalizeRoute(lit[1]);
          // A prefix of a dynamic route (e.g. "/api/bookings/" + id + "/" + action) is covered by its expansions.
          if (dynamic && dynamic.routes.some(r => r.startsWith(route) && r !== route)) continue;
          if (/:id\/:id$/.test(route) && dynamic) continue; // `${id}/${action}` literal, expanded above
          calls.push({ file, route });
        }
      }
    }
  }
  return calls;
}

describe("http adapter routes are documented", () => {
  const calls = adapterCalls();

  it("the normaliser handles templates, route params and queries", () => {
    expect(normalizeRoute("/api/bookings/${id}/accept")).toBe("/api/bookings/:id/accept");
    expect(normalizeRoute("/api/catalog?${params}")).toBe("/api/catalog");
    expect(normalizeRoute("/api/bookings/")).toBe("/api/bookings");
    expect(normalizeRoute("/api/providers/[id]/documents/[documentId]/signed-url")).toBe("/api/providers/:id/documents/:id/signed-url");
  });

  it("reads the contract table (scan sanity check)", () => {
    expect(contractRoutes.has("/api/bookings/:id/accept")).toBe(true);
    expect(contractRoutes.size).toBeGreaterThan(15);
  });

  it("finds the adapter calls it guards (scan sanity check)", () => {
    expect(calls.some(c => c.file === "bookings/http.ts")).toBe(true);
  });

  it("every route an http adapter calls is in API_CONTRACTS.md or a reviewed exception", () => {
    const undocumented = calls.filter(c => !contractRoutes.has(c.route) && !(c.route in NOT_IN_CONTRACTS)).map(c => `${c.file}: ${c.route}`);
    expect([...new Set(undocumented)]).toEqual([]);
  });

  it("dynamic adapters still contain every action they are expanded to", () => {
    const missing: string[] = [];
    for (const [file, { actions }] of Object.entries(DYNAMIC)) {
      const full = path.join(SRC, "modules", file);
      if (!existsSync(full)) continue;
      const text = readFileSync(full, "utf8");
      for (const action of actions) if (!text.includes(`"${action}"`)) missing.push(`${file}: ${action}`);
    }
    expect(missing).toEqual([]);
  });

  it("every exception names its backend source and is not already a contract row", () => {
    for (const [route, source] of Object.entries(NOT_IN_CONTRACTS)) {
      expect(source.trim().length, route).toBeGreaterThan(10);
      expect(contractRoutes.has(route), `${route} is now in API_CONTRACTS.md: delete the exception`).toBe(false);
    }
  });
});

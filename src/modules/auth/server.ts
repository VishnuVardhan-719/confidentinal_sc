import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAdapterMode } from "@/lib/api/mode";
import { getOnboardingApi } from "@/modules/onboarding";
import { getVerificationApi } from "@/modules/verification";
import { getOrganizationsApi } from "@/modules/organizations";
import { FIXTURE_SESSIONS } from "@/fixtures/identity";
import { fixtureScenarioFromToken } from "./fixture";
import { getAuthApi } from "./index";
import { decideRoleAccess, decideSessionAccess, type GuardOutcome, type RoleAccess, type SessionAccess, type SessionLookup } from "./guard";
import type { HttpAdapterOptions } from "./http-client";
import { accountSessionView, type AccountSession } from "./account-session";
import { DEFAULT_LOCALE } from "./routes";
import { isLocale, type Locale, type Role } from "./roles";
import { hadSession, readAccessToken } from "./session-cookie";

/**
 * SERVER-ONLY data-access layer for identity. Imports next/headers, so it cannot be bundled
 * into client components. Call these inside a <Suspense> boundary (cacheComponents).
 *
 * Usage in a private layout/page (other agents):
 *   const access = await requireRole("doctor", { locale, path: `/${locale}/doctor/visits` });
 *   if (access.kind === "denied") return <AccessDenied reason={access.reason} />;
 *   // access.identity, access.workspaces
 * Unauthenticated users are redirected to /{locale}/login?next=...; incomplete or
 * restricted workspaces are redirected to their onboarding/dashboard.
 */

/** Absolute origin for server-side calls to our own /api routes. Never derived from request headers. */
function apiOrigin(env: Record<string, string | undefined> = process.env): string | undefined {
  const raw = env.APP_ORIGIN;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

function httpOptions(token: string | null): HttpAdapterOptions {
  return { baseUrl: apiOrigin(), getAccessToken: () => token };
}

/** Synthetic user ID behind a fixture token (fixture mode only; ignored by the HTTP adapter). */
function fixtureActorId(token: string | null): string | undefined {
  const scenario = fixtureScenarioFromToken(token);
  const session = scenario ? FIXTURE_SESSIONS[scenario] : null;
  return session?.kind === "authenticated" ? session.identity.userId : undefined;
}

/** Module APIs bound to the caller's session. Construct per request; never share across users. */
export async function getRequestApis() {
  const store = await cookies();
  const token = readAccessToken(store);
  const http = httpOptions(token);
  return {
    auth: getAuthApi({ http, fixture: { accessToken: token } }),
    onboarding: getOnboardingApi({ http, fixture: { actorId: fixtureActorId(token) } }),
    verification: getVerificationApi({ http }),
    organizations: getOrganizationsApi({ http }),
  };
}

/** One session lookup per request, shared by guards and the header (React cache). */
export const getServerSession = cache(async (): Promise<SessionLookup> => {
  const store = await cookies();
  const token = readAccessToken(store);
  const previous = hadSession(store);
  if (!token) return { session: { ok: true, data: { kind: "anonymous" } }, hadSession: previous };
  const api = getAuthApi({ http: httpOptions(token), fixture: { accessToken: token } });
  return { session: await api.getSession(), hadSession: previous };
});

type GuardOptions = { locale?: Locale; path?: string };

/** Locale from the request (next-intl) when the caller did not pass one. */
async function resolveLocale(locale?: Locale): Promise<Locale> {
  if (locale) return locale;
  const current = await getLocale().catch(() => DEFAULT_LOCALE);
  return isLocale(current) ? current : DEFAULT_LOCALE;
}

export async function requireRole(role: Role, options: GuardOptions = {}): Promise<RoleAccess> {
  const locale = await resolveLocale(options.locale);
  const outcome = decideRoleAccess({ ...(await getServerSession()), role, locale, path: options.path });
  if (outcome.kind === "redirect") redirect(outcome.to);
  return outcome;
}

export async function requireSession(options: GuardOptions = {}): Promise<SessionAccess> {
  const locale = await resolveLocale(options.locale);
  const outcome = decideSessionAccess({ ...(await getServerSession()), locale, path: options.path });
  if (outcome.kind === "redirect") redirect(outcome.to);
  return outcome;
}

/**
 * For server actions: same decision as requireRole but never redirects. Anything other
 * than `allowed` must be treated as a refusal by the action (re-authorize every mutation).
 */
export async function authorizeRole(role: Role, options: GuardOptions = {}): Promise<GuardOutcome> {
  const locale = await resolveLocale(options.locale);
  return decideRoleAccess({ ...(await getServerSession()), role, locale, path: options.path });
}

/**
 * Non-PHI account view for the public header and operations workspaces (no IDs, contact
 * details or tokens). Never redirects. See docs/frontend/REQUESTS.md R-FE07-01.
 *   import { getAccountSession } from "@/modules/auth/server";
 *   const account = await getAccountSession(); // inside <Suspense>
 *   if (account.kind === "signed_in") ... account.displayName, account.role, account.dashboardHref
 */
export async function getAccountSession(locale?: Locale): Promise<AccountSession> {
  const [lookup, resolved] = await Promise.all([getServerSession(), resolveLocale(locale)]);
  return accountSessionView(lookup, resolved);
}

export type { AccountSession } from "./account-session";

/** True when the synthetic fixture adapter is active (pages must show <FixtureNotice/>). */
export const isFixtureAdapter = (): boolean => getAdapterMode() === "fixture";

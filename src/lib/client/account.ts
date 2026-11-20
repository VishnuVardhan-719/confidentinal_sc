"use client";

import { useEffect, useSyncExternalStore } from "react";
import { z } from "zod";
import { knownRoles, type Role } from "@/components/app/access";
import { api, ApiError } from "./api";
import { getTokens, parseTokenResponse, setTokens, subscribeTokens } from "./session";

/*
 * The signed-in account, from GET /api/auth/me. One shared store per tab: the header, the app nav and the
 * route gate all read the same state, and it is fetched once per sign-in.
 */

const meSchema = z.object({
  profile: z.object({
    id: z.string(),
    display_name: z.string(),
    locale: z.enum(["en", "te", "hi"]),
    version: z.number().int().positive(),
  }),
  roles: z.array(z.string()),
});

export type Locale = "en" | "te" | "hi";
export type Account = { id: string; name: string; locale: Locale; version: number; roles: Role[] };

export type AccountState =
  | { status: "unknown" }
  | { status: "signedOut" }
  | { status: "loading" }
  | { status: "signedIn"; account: Account }
  | { status: "error"; error: unknown };

const UNKNOWN: AccountState = { status: "unknown" };
const SIGNED_OUT: AccountState = { status: "signedOut" };
const LOADING: AccountState = { status: "loading" };

let me: AccountState = LOADING;
let loaded = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function snapshot(): AccountState {
  return getTokens() ? me : SIGNED_OUT;
}

function publish() {
  for (const listener of listeners) listener();
}

function forget() {
  me = LOADING;
  loaded = false;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const off = subscribeTokens(() => {
    if (!getTokens()) forget();
    listener();
  });
  return () => {
    listeners.delete(listener);
    off();
  };
}

export function toAccount(body: unknown): Account {
  const parsed = meSchema.parse(body);
  return {
    id: parsed.profile.id,
    name: parsed.profile.display_name,
    locale: parsed.profile.locale,
    version: parsed.profile.version,
    roles: knownRoles(parsed.roles),
  };
}

/** Loads the account for the current session. `force` reloads it even if it is already loaded. */
export function loadAccount(force = false): Promise<void> {
  if (!getTokens()) return Promise.resolve();
  if (inflight) return inflight;
  if (loaded && !force && me.status === "signedIn") return Promise.resolve();
  loaded = true;
  if (me.status !== "signedIn") me = LOADING;
  publish();
  inflight = (async () => {
    try {
      me = { status: "signedIn", account: toAccount(await api<unknown>("/api/auth/me", { auth: true })) };
    } catch (error) {
      // A 401 has already cleared the tokens, so the state reads as signed out.
      me = error instanceof ApiError && error.status === 401 ? LOADING : { status: "error", error };
      if (me.status === "error") loaded = false;
    } finally {
      inflight = null;
      publish();
    }
  })();
  return inflight;
}

/** Current account state. "unknown" during the server render and the hydration render. */
export function useAccount(): AccountState {
  const value = useSyncExternalStore(subscribe, snapshot, () => UNKNOWN);
  useEffect(() => {
    void loadAccount();
  }, []);
  return value;
}

/** Signs in with email and password. Resolves with the account, or rejects with an ApiError. */
export async function signIn(email: string, password: string): Promise<Account> {
  const body = await api<unknown>("/api/auth/login", { method: "POST", body: { email, password } });
  const tokens = parseTokenResponse(body);
  if (!tokens) throw new ApiError(503, "identity_unavailable");
  forget();
  setTokens(tokens);
  await loadAccount(true);
  const result = snapshot();
  if (result.status === "signedIn") return result.account;
  throw result.status === "error" ? result.error : new ApiError(401, "unauthenticated");
}

/** Ends the session on the server (best effort) and always forgets the tokens in this tab. */
export async function signOut(): Promise<void> {
  const tokens = getTokens();
  if (tokens) {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      cache: "no-store",
      credentials: "omit",
    }).catch(() => undefined);
  }
  forget();
  setTokens(null);
}

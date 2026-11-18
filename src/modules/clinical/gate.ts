import { fail, ok, type ApiResult } from "@/lib/api/result";
import { isEnabled } from "@/lib/feature-flags";

type Env = Record<string, string | undefined>;

/** Clinical features are OFF unless FEATURE_CLINICAL is exactly "true" (server-side env). */
export function clinicalGate(env: Env = process.env): ApiResult<true> {
  return isEnabled("clinical", env) ? ok(true) : fail("gated");
}

export const isClinicalEnabled = (env: Env = process.env): boolean => clinicalGate(env).ok;

type AsyncApi = Record<string, (...args: never[]) => Promise<ApiResult<unknown>>>;

/**
 * Wrap the listed methods so they return fail("gated") without calling the adapter
 * while the clinical flag is off. UI gating is cosmetic; the server must also fail closed.
 */
export function gateMethods<T extends AsyncApi>(api: T, keys: readonly (keyof T)[], env: Env = process.env): T {
  if (isClinicalEnabled(env)) return api;
  const gated: T = { ...api };
  for (const key of keys) {
    const blocked = (async () => fail("gated")) as unknown as T[typeof key];
    gated[key] = blocked;
  }
  return gated;
}

/** Every method of the API is gated. */
export function gateAll<T extends AsyncApi>(api: T, env: Env = process.env): T {
  return gateMethods(api, Object.keys(api) as (keyof T)[], env);
}

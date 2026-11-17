/*
 * Auth is not connected to a backend yet (I01 owns Supabase Auth). While this is false, every auth form
 * validates locally, keeps its submit button disabled, explains why, and never sends anything.
 *
 * When I01 lands: add an `auth` flag to src/lib/feature-flags (owner's scope), read it on the server with
 * isEnabled("auth"), and pass it down. Do not flip this constant to true without a real server action.
 */
export const AUTH_CONNECTED = false;

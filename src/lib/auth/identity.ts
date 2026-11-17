import type { SupabaseClient } from "@supabase/supabase-js";

// Structural boundary keeps tests independent of network/session internals.
type IdentityClient = Pick<SupabaseClient, "auth" | "from" | "rpc">;
type AuthReader = {
  auth: { getUser: () => PromiseLike<{ data: { user: { id: string } | null }; error: unknown }> };
  from: IdentityClient["from"];
};
export class IdentityError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}
// Transport/upstream failures must never look like an invalid user session.
export function assertAuthService(error: unknown) {
  if (!error) return;
  const details = typeof error === "object" ? error as { status?: number; name?: string } : {};
  if (details.status === 429) throw new IdentityError(429, "rate_limited");
  if (details.name === "AuthRetryableFetchError" || details.status === 0 || (details.status ?? 0) >= 500) {
    throw new IdentityError(503, "identity_unavailable");
  }
  if ([400, 401, 403, 422].includes(details.status ?? 0) ||
    ["AuthSessionMissingError", "AuthInvalidJwtError"].includes(details.name ?? "")) return;
  throw new IdentityError(503, "identity_unavailable");
}
export async function authenticate(db: AuthReader) {
  const { data, error } = await Promise.resolve(db.auth.getUser()).catch(() => {
    throw new IdentityError(503, "identity_unavailable");
  });
  assertAuthService(error);
  if (error || !data.user) throw new IdentityError(401, "unauthenticated");
  const { data: profile, error: profileError } = await db.from("profiles").select("id,status").eq("id", data.user.id).eq("status", "active").maybeSingle();
  if (profileError) throw new IdentityError(500, "identity_unavailable");
  if (!profile) throw new IdentityError(403, "inactive_account");
  return { userId: data.user.id };
}
export type IdentityCommand = "identity_roles" | "update_self_profile" | "create_self_patient" | "create_organization" | "update_organization" | "set_organization_member" | "accept_organization_invite" | "list_organization_invites" | "list_organizations" | "list_organization_members" | "list_organization_invites_page";
export async function command(db: Pick<IdentityClient, "rpc">, name: IdentityCommand, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  if (error) {
    const status = ({ "42501": 403, "40001": 409, "23505": 409, "22023": 422, "23514": 422 } as Record<string, number>)[error.code] ?? 500;
    throw new IdentityError(status, ({ 403: "forbidden", 409: "conflict", 422: "invalid_input" } as Record<number, string>)[status] ?? "identity_unavailable");
  }
  return data;
}

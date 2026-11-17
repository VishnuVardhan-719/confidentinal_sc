import { createClient } from "@supabase/supabase-js";
import { parsePublicEnv } from "@/lib/env";
import { IdentityError } from "@/lib/auth/identity";

// Request-local user JWT + public key only. Never use a service-role fallback.
// Bearer transport is explicit; no ambient cookie authority for these endpoints.
export function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header || !/^Bearer [^\s]+$/i.test(header)) throw new IdentityError(401, "unauthenticated");
  return header.slice(7);
}
export function requestClient(request: Request) {
  return publicAuthClient(`Bearer ${bearerToken(request)}`);
}
export function publicAuthClient(authorization?: string) {
  const env = parsePublicEnv(process.env);
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: authorization ? { headers: { Authorization: authorization } } : undefined,
  });
}

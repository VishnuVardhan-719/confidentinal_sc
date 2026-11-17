import { bearerToken, requestClient } from "@/lib/db/request-client";
import { endpoint, json } from "@/lib/auth/http";
import { IdentityError } from "@/lib/auth/identity";

export async function POST(request: Request) {
  return endpoint(async () => {
    const db = requestClient(request);
    // Logout remains available to disabled accounts. GoTrue verifies the supplied
    // JWT. This SDK method POSTs /logout with that JWT + public key; no admin key.
    // auth.signOut() alone cannot revoke a stateless bearer-only client's session.
    const { error } = await db.auth.admin.signOut(bearerToken(request), "local");
    if (error) throw new IdentityError(401, "invalid_session");
    // Supabase access JWTs remain valid until expiry; clients must discard tokens.
    return json({ status: "signed_out" });
  });
}

import { publicAuthClient } from "@/lib/db/request-client";
import { refreshSchema } from "@/lib/validation/identity";
import { endpoint, input, json } from "@/lib/auth/http";
import { assertAuthService, authenticate, IdentityError } from "@/lib/auth/identity";

export async function POST(request: Request) {
  return endpoint(async () => {
    const value = await input(request, refreshSchema);
    const db = publicAuthClient();
    const { data, error } = await db.auth.refreshSession({ refresh_token: value.refreshToken });
    assertAuthService(error);
    if (error || !data.session) throw new IdentityError(401, "invalid_session");
    await authenticate(db);
    return json({ accessToken: data.session.access_token, refreshToken: data.session.refresh_token, expiresAt: data.session.expires_at });
  });
}

import { publicAuthClient } from "@/lib/db/request-client";
import { credentialsSchema } from "@/lib/validation/identity";
import { endpoint, input, json } from "@/lib/auth/http";
import { assertAuthService, IdentityError } from "@/lib/auth/identity";

export async function POST(request: Request) {
  return endpoint(async () => {
    const credentials = await input(request, credentialsSchema);
    const { error } = await publicAuthClient().auth.signUp(credentials);
    assertAuthService(error);
    if (error) throw new IdentityError(422, "signup_unavailable");
    // Same response for existing/new accounts; provider never receives metadata roles.
    // Confirmation and delivery settings remain client-owned Supabase configuration.
    return json({ status: "signup_received" }, 202);
  });
}

import { endpoint, input, json, session } from "@/lib/auth/http";
import { command } from "@/lib/auth/identity";
import { profilePatchSchema } from "@/lib/validation/identity";

export async function PATCH(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const value = await input(request, profilePatchSchema);
    return json({ profile: await command(db, "update_self_profile", { p_display_name: value.displayName, p_locale: value.locale, p_expected_version: value.expectedVersion }) });
  });
}

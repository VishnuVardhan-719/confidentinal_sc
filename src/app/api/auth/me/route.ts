import { endpoint, json, session } from "@/lib/auth/http";
import { command, IdentityError } from "@/lib/auth/identity";

export async function GET(request: Request) {
  return endpoint(async () => {
    const { db, actor } = await session(request);
    const { data: profile, error } = await db.from("profiles").select("id,display_name,locale,version").eq("id", actor.userId).single();
    if (error) throw new IdentityError(500, "identity_unavailable");
    return json({ profile, roles: await command(db, "identity_roles", {}) });
  });
}

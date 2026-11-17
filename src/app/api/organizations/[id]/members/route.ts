import { z } from "zod";
import { endpoint, input, json, session } from "@/lib/auth/http";
import { command, IdentityError } from "@/lib/auth/identity";
import { membershipSchema } from "@/lib/validation/identity";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = z.uuid().safeParse((await context.params).id);
    if (!id.success) throw new IdentityError(422, "invalid_input");
    const { data, error } = await db.from("organization_members").select("id,profile_id,membership_role,status,scopes,version").eq("organization_id", id.data).order("id").limit(100);
    if (error) throw new IdentityError(500, "identity_unavailable");
    return json({ members: data });
  });
}
export async function POST(request: Request, context: Context) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = z.uuid().safeParse((await context.params).id);
    if (!id.success) throw new IdentityError(422, "invalid_input");
    const value = await input(request, membershipSchema);
    return json({ membershipId: await command(db, "set_organization_member", {
      p_organization_id: id.data, p_profile_id: value.profileId, p_membership_role: value.membershipRole,
      p_status: value.status, p_scopes: value.scopes, p_expected_version: value.expectedVersion,
    }) });
  });
}

import { z } from "zod";
import { endpoint, input, json, session } from "@/lib/auth/http";
import { command, IdentityError } from "@/lib/auth/identity";
import { acceptInviteSchema } from "@/lib/validation/identity";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = z.uuid().safeParse((await context.params).id);
    if (!id.success) throw new IdentityError(422, "invalid_input");
    const value = await input(request, acceptInviteSchema);
    return json({ membershipId: await command(db, "accept_organization_invite", {
      p_organization_id: id.data, p_expected_version: value.expectedVersion,
    }) });
  });
}

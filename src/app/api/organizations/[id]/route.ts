import { z } from "zod";
import { endpoint, input, json, session } from "@/lib/auth/http";
import { command, IdentityError } from "@/lib/auth/identity";
import { organizationPatchSchema } from "@/lib/validation/identity";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = z.uuid().safeParse((await context.params).id);
    if (!id.success) throw new IdentityError(422, "invalid_input");
    const value = await input(request, organizationPatchSchema);
    return json({ organization: await command(db, "update_organization", { p_organization_id: id.data, p_name: value.name, p_expected_version: value.expectedVersion }) });
  });
}

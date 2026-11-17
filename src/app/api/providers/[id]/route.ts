import { endpoint, input, json, session } from "@/lib/auth/http";
import { IdentityError } from "@/lib/auth/identity";
import { providerCommand, readProvider } from "@/lib/providers/service";
import { providerIdSchema, providerPatchSchema } from "@/lib/validation/providers";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = providerIdSchema.safeParse((await context.params).id);
    if (!id.success) throw new IdentityError(422, "invalid_input");
    return json({ provider: await readProvider(db, id.data) });
  });
}
export async function PATCH(request: Request, context: Context) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = providerIdSchema.safeParse((await context.params).id);
    if (!id.success) throw new IdentityError(422, "invalid_input");
    const value = await input(request, providerPatchSchema);
    return json({ provider: await providerCommand(db, "update_provider", {
      p_provider_id: id.data, p_display_name: value.displayName,
      p_description: value.description, p_expected_version: value.expectedVersion,
    }) });
  });
}

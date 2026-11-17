import { endpoint, input, json, session } from "@/lib/auth/http";
import { IdentityError } from "@/lib/auth/identity";
import { providerCommand } from "@/lib/providers/service";
import { providerIdSchema, reviewSchema } from "@/lib/validation/providers";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = providerIdSchema.safeParse((await context.params).id);
    if (!id.success) throw new IdentityError(422, "invalid_input");
    const value = await input(request, reviewSchema);
    return json({ provider: await providerCommand(db, "review_provider", {
      p_provider_id: id.data, p_decision: value.decision, p_reason: value.reason, p_expected_version: value.expectedVersion,
    }) });
  });
}

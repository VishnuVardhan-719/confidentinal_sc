import { endpoint, input, json, session } from "@/lib/auth/http";
import { providerCommand } from "@/lib/providers/service";
import { providerCreateSchema } from "@/lib/validation/providers";

export async function POST(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const value = await input(request, providerCreateSchema);
    const providerId = await providerCommand(db, "create_provider", {
      p_category: value.category, p_display_name: value.displayName,
      p_description: value.description, p_organization_id: value.organizationId ?? null,
    });
    return json({ providerId }, 201);
  });
}

import { endpoint, input, json, session } from "@/lib/auth/http";
import { IdentityError } from "@/lib/auth/identity";
import { DOCUMENT_BUCKET, providerCommand } from "@/lib/providers/service";
import { providerIdSchema, documentSchema } from "@/lib/validation/providers";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = providerIdSchema.safeParse((await context.params).id);
    if (!id.success) throw new IdentityError(422, "invalid_input");
    const value = await input(request, documentSchema);
    const result = await providerCommand(db, "add_provider_document", {
      p_provider_id: id.data, p_kind: value.kind, p_content_type: value.contentType,
      p_expires_at: value.expiresAt, p_expected_version: value.expectedVersion,
    });
    return json({ document: result.document, upload: { bucket: DOCUMENT_BUCKET, upsert: false, maxBytes: 10_485_760 }, providerVersion: result.provider_version }, 201);
  });
}

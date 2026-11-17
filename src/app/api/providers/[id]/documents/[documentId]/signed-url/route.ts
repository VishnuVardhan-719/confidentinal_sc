import { endpoint, json, session } from "@/lib/auth/http";
import { IdentityError } from "@/lib/auth/identity";
import { signedDocumentUrl } from "@/lib/providers/service";
import { providerIdSchema } from "@/lib/validation/providers";

export async function POST(request: Request, context: { params: Promise<{ id: string; documentId: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const params = await context.params;
    const id = providerIdSchema.safeParse(params.id);
    const documentId = providerIdSchema.safeParse(params.documentId);
    if (!id.success || !documentId.success) throw new IdentityError(422, "invalid_input");
    return json(await signedDocumentUrl(db, id.data, documentId.data));
  });
}

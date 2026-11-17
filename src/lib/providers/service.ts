import type { SupabaseClient } from "@supabase/supabase-js";
import { IdentityError } from "@/lib/auth/identity";

export const DOCUMENT_BUCKET = "provider-verification";
type Client = Pick<SupabaseClient, "rpc" | "from" | "storage">;
type ProviderCommand = "create_provider" | "update_provider" | "add_provider_document" | "submit_provider" | "review_provider";

export function databaseError(error: { code?: string } | null) {
  if (!error) return;
  const status = ({ "42501": 403, "40001": 409, "23505": 409, "22023": 422, "23514": 422, "22007": 422 } as Record<string, number>)[error.code ?? ""] ?? 503;
  throw new IdentityError(status, ({ 403: "forbidden", 409: "conflict", 422: "invalid_input" } as Record<number, string>)[status] ?? "provider_unavailable");
}
export async function providerCommand(db: Pick<Client, "rpc">, name: ProviderCommand, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  databaseError(error);
  return data;
}
export async function readProvider(db: Pick<Client, "from">, id: string) {
  const provider = await db.from("providers").select("id,category,organization_id,verification_state,status,version").eq("id", id).maybeSingle();
  databaseError(provider.error);
  if (!provider.data) throw new IdentityError(404, "not_found");
  const [profile, documents, events] = await Promise.all([
    db.from("provider_profiles").select("display_name,description").eq("provider_id", id).maybeSingle(),
    db.from("provider_documents").select("id,kind,status,expires_at,created_at").eq("provider_id", id).order("created_at", { ascending: false }).limit(50),
    db.from("provider_verification_events").select("from_state,to_state,public_reason,reviewed_document_ids,provider_version,occurred_at").eq("provider_id", id).order("occurred_at", { ascending: false }).limit(100),
  ]);
  for (const result of [profile, documents, events]) databaseError(result.error);
  return { ...provider.data, profile: profile.data, documents: documents.data, events: events.data };
}
export async function signedDocumentUrl(db: Client, providerId: string, documentId: string) {
  // Recheck private metadata before returning the capability gate. A user JWT can
  // bypass application expiresIn values by calling Storage directly, so signing
  // stays disabled until a reviewed signer can enforce the lifetime globally.
  const { data, error } = await db.from("provider_documents").select("bucket_id,object_name")
    .eq("provider_id", providerId).eq("id", documentId).maybeSingle();
  databaseError(error);
  if (!data || data.bucket_id !== DOCUMENT_BUCKET) throw new IdentityError(404, "not_found");
  throw new IdentityError(503, "provider_signed_urls_unavailable");
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { IdentityError } from "@/lib/auth/identity";
import { categorySchema, paiseSchema, pinSchema, searchSchema } from "@/lib/validation/catalog";

type Client = Pick<SupabaseClient, "rpc" | "from">;
type Command = "upsert_service" | "publish_price_version" | "propose_service_area" | "withdraw_service_area" | "review_service_area";
export function catalogError(error: { code?: string } | null) {
  if (!error) return;
  const status = ({ "42501": 403, "40001": 409, "23505": 409, "23P01": 409,
    "23503": 422, "23514": 422, "22023": 422, "22003": 422, "22007": 422, "22008": 422,
    "PGRST003": 503 } as Record<string, number>)[error.code ?? ""] ?? 503;
  throw new IdentityError(status, ({ 403: "forbidden", 409: "conflict", 422: "invalid_input" } as Record<number, string>)[status] ?? "catalog_unavailable");
}
export async function catalogCommand(db: Pick<Client, "rpc">, name: Command, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  catalogError(error);
  return data;
}
// Parse with strip semantics: even an accidental upstream column addition cannot
// expand the HTTP public projection. Paise remains a decimal string throughout.
const publicRow = z.object({ provider_id: z.uuid(), category: categorySchema, display_name: z.string(),
  service_id: z.uuid(), service_title: z.string(), duration_minutes: z.number().int().positive(),
  amount_paise: paiseSchema, currency: z.literal("INR"), unit: z.enum(["visit", "test", "trip", "hour", "day"]),
  terms_version: z.string(), pin_code: pinSchema, city: z.string(), advisory_availability: z.null(),
});
type Search = z.infer<typeof searchSchema>;
export async function searchCatalog(db: Pick<Client, "rpc">, value: Search) {
  const { data, error } = await db.rpc("search_providers", {
    p_category: value.category, p_pin: value.pin, p_price_max: value.priceMax ?? null, p_limit: value.limit,
    p_after_amount: value.cursor?.[0] ?? null, p_after_provider: value.cursor?.[1] ?? null, p_after_service: value.cursor?.[2] ?? null,
  });
  catalogError(error);
  const rows = z.array(publicRow).parse(data);
  const last = rows.at(-1);
  return { results: rows, nextCursor: rows.length === value.limit && last
    ? `${last.amount_paise},${last.provider_id},${last.service_id}` : null };
}
export async function publicProvider(db: Pick<Client, "rpc">, id: string, category: Search["category"], pin: string) {
  const { data, error } = await db.rpc("get_public_provider", { p_provider_id: id, p_category: category, p_pin: pin });
  catalogError(error);
  const rows = z.array(publicRow).parse(data);
  if (!rows.length) throw new IdentityError(404, "not_found");
  return { results: rows };
}
export async function privateCatalog(db: Client, providerId: string) {
  // Parent read first: avoids revealing existence of private rows outside RLS.
  const provider = await db.from("providers").select("id,version").eq("id", providerId).maybeSingle();
  catalogError(provider.error);
  if (!provider.data) throw new IdentityError(404, "not_found");
  const [services, coverage] = await Promise.all([
    db.from("services").select("id,provider_id,catalog_type_id,title,description,duration_minutes,status,version,service_price_versions(id,version,amount_paise::text,currency,unit,terms_version,effective_from,effective_to)")
      .eq("provider_id", providerId).order("id").limit(100),
    db.from("provider_service_areas").select("id,pin_code,status,valid_from,valid_to,version").eq("provider_id", providerId).order("id").limit(100),
  ]);
  catalogError(services.error); catalogError(coverage.error);
  return { providerVersion: provider.data.version, services: services.data, coverage: coverage.data };
}
export async function coverageQueue(db: Pick<Client, "rpc">, limit: number, after?: string) {
  const { data, error } = await db.rpc("list_service_area_reviews", { p_limit: limit, p_after: after ?? null });
  catalogError(error);
  const rows = z.array(z.object({ area_id: z.uuid(), provider_id: z.uuid(), category: categorySchema,
    display_name: z.string(), pin_code: pinSchema, status: z.enum(["proposed", "approved", "rejected", "revoked"]),
    valid_from: z.string().nullable(), valid_to: z.string().nullable(), version: z.number().int().positive(),
  })).parse(data);
  return { results: rows, nextCursor: rows.length === limit ? rows.at(-1)?.area_id ?? null : null };
}

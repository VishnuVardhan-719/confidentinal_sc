import { z } from "zod";
import { fail, ok, type ApiError, type ApiResult } from "@/lib/api/result";
import { LOCALES, type Locale } from "@/lib/format";
import { categorySchema, pinSchema, type Category } from "@/modules/catalog/schemas";
import type { ProvidersApi } from "./api";
import { directoryCard, readDirectoryQuery } from "./directory-model";
import { providerPageSchema, providerDetailSchema } from "./schemas";

type Card = ReturnType<typeof directoryCard>;
export type DirectoryLoad = { kind: "needs_pin" | "invalid" } | { kind: "error"; error: ApiError }
  | { kind: "empty" | "ready"; cards: Card[]; nextCursor: string | null; synthetic: boolean };
/** Inject a request-scoped adapter. No cache, credentials forwarding or global private client. */
export async function loadDirectory(api: Pick<ProvidersApi, "list">, category: Category, search: URLSearchParams, locale: Locale): Promise<DirectoryLoad> {
  if (!z.enum(LOCALES).safeParse(locale).success) return { kind: "invalid" };
  const query = readDirectoryQuery(category, search);
  if (query.kind !== "ready") return query;
  let result;
  try { result = await api.list(query.filters); } catch { return { kind: "error", error: { code: "unavailable" } }; }
  if (!result.ok) return { kind: "error", error: result.error };
  const parsed = providerPageSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.items.some(item => item.category !== category || item.pin !== query.filters.pin)) return { kind: "error", error: { code: "unavailable" } };
  return { kind: parsed.data.items.length ? "ready" : "empty", cards: parsed.data.items.map(item => directoryCard(item, locale)), nextCursor: parsed.data.nextCursor, synthetic: parsed.data.synthetic };
}
export async function loadProviderProfile(api: Pick<ProvidersApi, "get">, id: string, category: Category, pin: string, locale: Locale): Promise<ApiResult<{ cards: Card[]; synthetic: boolean }>> {
  const scope = z.object({ id: z.uuid(), category: categorySchema, pin: pinSchema, locale: z.enum(LOCALES) }).safeParse({ id, category, pin, locale });
  if (!scope.success) return fail("validation");
  let result;
  try { result = await api.get(id, { category, pin: scope.data.pin }); } catch { return fail("unavailable"); }
  if (!result.ok) return result;
  const parsed = providerDetailSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.items.some(item => item.id !== id || item.category !== category || item.pin !== scope.data.pin)) return fail("unavailable");
  if (!parsed.data.items.length) return fail("not_found");
  return ok({ cards: parsed.data.items.map(item => directoryCard(item, locale)), synthetic: parsed.data.synthetic });
}

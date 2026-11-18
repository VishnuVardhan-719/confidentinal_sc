import { z } from "zod";
import { createHttpClient, type HttpClient } from "@/lib/api/http";
import { fail, ok } from "@/lib/api/result";
import { catalogCursorSchema, catalogRowSchema, categorySchema, pinSchema } from "@/modules/catalog/schemas";
import type { ProvidersApi } from "./api";
import { filtersSchema, filtersToSearchParams } from "./filters";
import type { PublicProvider } from "./schemas";

function project(row: z.infer<typeof catalogRowSchema>): PublicProvider {
  return { id: row.provider_id, serviceId: row.service_id, category: row.category,
    displayName: row.display_name, serviceTitle: row.service_title, durationMinutes: row.duration_minutes,
    amountPaise: row.amount_paise, currency: row.currency, unit: row.unit, termsVersion: row.terms_version,
    pin: row.pin_code, city: row.city, availability: "advisory_only", synthetic: false };
}
export function createProvidersHttpApi(http: HttpClient = createHttpClient()): ProvidersApi {
  return {
    async list(input, options) {
      const parsed = filtersSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      // Backend has stable price-ascending cursor pagination only. Never sort one page as if global.
      if (parsed.data.sort !== "price_asc") return fail("gated");
      const params = filtersToSearchParams(parsed.data);
      params.delete("sort");
      const result = await http.request(`/api/catalog?${params}`, z.object({ results: z.array(catalogRowSchema), nextCursor: catalogCursorSchema.nullable() }), { signal: options?.signal });
      return result.ok ? ok({ items: result.data.results.map(project), nextCursor: result.data.nextCursor, synthetic: false }) : result;
    },
    async get(id, scope) {
      const parsed = z.object({ id: z.uuid(), category: categorySchema, pin: pinSchema }).safeParse({ id, category: scope.category, pin: scope.pin });
      if (!parsed.success) return fail("validation");
      const params = new URLSearchParams({ category: parsed.data.category, pin: parsed.data.pin });
      const result = await http.request(`/api/catalog/${parsed.data.id}?${params}`, z.object({ results: z.array(catalogRowSchema) }));
      return result.ok ? ok({ items: result.data.results.map(project), synthetic: false }) : result;
    },
  };
}

import { z } from "zod";
import { fail, ok, type ApiResult } from "@/lib/api/result";
import { catalogCursorSchema, categorySchema, paiseSchema, pinSchema } from "@/modules/catalog/schemas";

export const filtersSchema = z.strictObject({
  category: categorySchema, pin: pinSchema, priceMax: paiseSchema.optional(),
  sort: z.enum(["price_asc", "price_desc"]).default("price_asc"),
  limit: z.number().int().min(1).max(50).default(20),
  cursor: catalogCursorSchema.optional(),
});
export type ProviderFilters = z.input<typeof filtersSchema>;
export type ParsedProviderFilters = z.output<typeof filtersSchema>;

export function filtersFromSearchParams(params: URLSearchParams): ApiResult<ParsedProviderFilters> {
  const entries = Array.from(params.entries());
  if (new Set(entries.map(([key]) => key)).size !== entries.length) return fail("validation");
  const raw: Record<string, unknown> = Object.fromEntries(entries);
  for (const field of ["priceMax", "limit"] as const) {
    if (raw[field] !== undefined) {
      if (typeof raw[field] !== "string" || !/^\d+$/.test(raw[field])) return fail("validation");
      raw[field] = Number(raw[field]);
    }
  }
  const parsed = filtersSchema.safeParse(raw);
  return parsed.success ? ok(parsed.data) : fail("validation");
}
export function filtersToSearchParams(value: ProviderFilters): URLSearchParams {
  const parsed = filtersSchema.parse(value);
  const params = new URLSearchParams();
  for (const [key, item] of Object.entries(parsed)) if (item !== undefined) params.set(key, String(item));
  return params;
}

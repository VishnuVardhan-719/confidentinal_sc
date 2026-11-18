import { z } from "zod";
import { fail, ok, type ApiResult } from "@/lib/api/result";
import { formatPaise, LOCALES, type Locale } from "@/lib/format";
import { categorySchema, type Category } from "@/modules/catalog/schemas";
import { filtersFromSearchParams, type ParsedProviderFilters } from "./filters";
import { publicProviderSchema, type PublicProvider } from "./schemas";

export const DIRECTORY_ROUTES: Record<Category, string> = { doctor: "doctors", lab: "lab-tests", ambulance: "ambulances", caretaker: "caretakers" };
export type DirectoryQuery = { kind: "needs_pin" } | { kind: "invalid" } | { kind: "ready"; filters: ParsedProviderFilters };
/** Only public catalog fields may travel in the URL. Route owns the category. */
export function readDirectoryQuery(category: Category, search: URLSearchParams): DirectoryQuery {
  if (!categorySchema.safeParse(category).success) return { kind: "invalid" };
  const params = new URLSearchParams(search);
  const entries = Array.from(params.entries());
  if (new Set(entries.map(([key]) => key)).size !== entries.length || entries.some(([key]) => !["category", "pin", "priceMax", "sort", "limit", "cursor"].includes(key))) return { kind: "invalid" };
  if (params.has("category") && params.get("category") !== category) return { kind: "invalid" };
  if (!params.has("pin")) return params.size === 0 || (params.size === 1 && params.has("category")) ? { kind: "needs_pin" } : { kind: "invalid" };
  params.set("category", category);
  const result = filtersFromSearchParams(params);
  return result.ok ? { kind: "ready", filters: result.data } : { kind: "invalid" };
}
export const directoryDraftSchema = z.strictObject({ pin: z.string(), priceMax: z.string(), sort: z.enum(["price_asc", "price_desc"]) });
export type DirectoryDraft = z.infer<typeof directoryDraftSchema>;
export function applyDirectoryDraft(category: Category, value: unknown): ApiResult<URLSearchParams> {
  const draft = directoryDraftSchema.safeParse(value);
  if (!draft.success) return fail("validation");
  if (draft.data.pin === "" && draft.data.priceMax === "") return ok(new URLSearchParams());
  const params = new URLSearchParams({ pin: draft.data.pin, sort: draft.data.sort });
  if (draft.data.priceMax !== "") params.set("priceMax", draft.data.priceMax);
  return readDirectoryQuery(category, params).kind === "ready" ? ok(params) : fail("validation");
}
export function directoryDraftFromQuery(query: DirectoryQuery): DirectoryDraft {
  return query.kind === "ready" ? { pin: query.filters.pin, priceMax: query.filters.priceMax === undefined ? "" : String(query.filters.priceMax), sort: query.filters.sort }
    : { pin: "", priceMax: "", sort: "price_asc" };
}
export function directoryCard(input: PublicProvider, locale: Locale) {
  const provider = publicProviderSchema.parse(input);
  z.enum(LOCALES).parse(locale);
  return { id: provider.id, serviceId: provider.serviceId, displayName: provider.displayName, serviceTitle: provider.serviceTitle,
    price: formatPaise(provider.amountPaise, locale), unit: provider.unit, city: provider.city, pin: provider.pin,
    availability: provider.availability, acceptance: "manual" as const, synthetic: provider.synthetic,
    href: "/" + locale + "/" + DIRECTORY_ROUTES[provider.category] + "/" + provider.id + "?" + new URLSearchParams({ pin: provider.pin }) };
}

import { z } from "zod";
import { providerCategorySchema } from "@/modules/auth/roles";
import { pinCodeSchema } from "@/modules/onboarding/shared";
import { expectedVersionSchema, reasonSchema } from "./schemas";
import { PROVIDER_STATUSES } from "./status";

/**
 * Admin list filters and coverage management (FRONTEND_MASTER section 15).
 * Filters come from the URL (public filter state is allowed in URLs; no PHI here).
 * Invalid values are dropped, never forwarded.
 */

export const EXPIRY_WINDOWS = ["30d", "90d", "expired"] as const;
export type ExpiryWindow = (typeof EXPIRY_WINDOWS)[number];

export const reviewQueueFilterSchema = z.strictObject({
  category: providerCategorySchema.optional(),
  status: z.enum(PROVIDER_STATUSES).optional(),
  expiry: z.enum(EXPIRY_WINDOWS).optional(),
});
export type ReviewQueueFilter = z.infer<typeof reviewQueueFilterSchema>;

type SearchParamsLike = Record<string, string | string[] | undefined> | URLSearchParams;

function first(params: SearchParamsLike, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const value = params[key];
  return Array.isArray(value) ? undefined : value;
}

function pick<T extends z.ZodType>(schema: T, value: string | undefined): z.infer<T> | undefined {
  if (value === undefined) return undefined;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** Repeated keys are treated as invalid (dropped) rather than guessed. */
export function parseReviewQueueFilter(params: SearchParamsLike): ReviewQueueFilter {
  const filter: ReviewQueueFilter = {};
  const category = pick(providerCategorySchema, first(params, "category"));
  const status = pick(z.enum(PROVIDER_STATUSES), first(params, "status"));
  const expiry = pick(z.enum(EXPIRY_WINDOWS), first(params, "expiry"));
  if (category) filter.category = category;
  if (status) filter.status = status;
  if (expiry) filter.expiry = expiry;
  return filter;
}

/** True if a document expiry (ISO) falls in the window relative to `now`. */
export function matchesExpiryWindow(expiresAt: string | null, window: ExpiryWindow, now: Date): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return false;
  const diffDays = (t - now.getTime()) / 86_400_000;
  if (window === "expired") return diffDays <= 0;
  const limit = window === "30d" ? 30 : 90;
  return diffDays > 0 && diffDays <= limit;
}

/* ---------------- Coverage (canonical `provider_service_areas`) ---------------- */

export const COVERAGE_STATES = ["proposed", "approved", "rejected", "revoked"] as const;
export type CoverageState = (typeof COVERAGE_STATES)[number] | "unknown";
export const parseCoverageState = (raw: unknown): CoverageState =>
  typeof raw === "string" && (COVERAGE_STATES as readonly string[]).includes(raw) ? (raw as CoverageState) : "unknown";

export type CoverageArea = {
  areaId: string;
  providerId: string;
  providerName: string;
  category: z.infer<typeof providerCategorySchema>;
  pinCode: string;
  state: CoverageState;
  validUntil: string | null;
  version: number;
};

export const coverageFilterSchema = z.strictObject({
  category: providerCategorySchema.optional(),
  state: z.enum(COVERAGE_STATES).optional(),
  pin: pinCodeSchema.optional(),
});
export type CoverageFilter = z.infer<typeof coverageFilterSchema>;

export function parseCoverageFilter(params: SearchParamsLike): CoverageFilter {
  const filter: CoverageFilter = {};
  const category = pick(providerCategorySchema, first(params, "category"));
  const state = pick(z.enum(COVERAGE_STATES), first(params, "state"));
  const pin = pick(pinCodeSchema, first(params, "pin"));
  if (category) filter.category = category;
  if (state) filter.state = state;
  if (pin) filter.pin = pin;
  return filter;
}

export const COVERAGE_DECISIONS = ["approve", "reject", "revoke"] as const;
export type CoverageDecision = (typeof COVERAGE_DECISIONS)[number];

export const coverageDecisionSchema = z.strictObject({
  areaId: z.uuid(),
  decision: z.enum(COVERAGE_DECISIONS),
  reason: reasonSchema,
  expectedVersion: expectedVersionSchema,
});
export type CoverageDecisionInput = z.infer<typeof coverageDecisionSchema>;

export function allowedCoverageDecisions(state: CoverageState): readonly CoverageDecision[] {
  if (state === "proposed") return ["approve", "reject"];
  if (state === "approved") return ["revoke"];
  return [];
}

import type { AuditCategory, AuditOutcome } from "./types";

/**
 * Canonical audit label keys (namespace `admin`, audit area) and tones.
 * Unknown values map to neutral "unknown", never to success.
 */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";
export type StatusDescriptor = { readonly labelKey: string; readonly tone: StatusTone; readonly known: boolean };

const UNKNOWN: StatusDescriptor = { labelKey: "admin.audit.unknown", tone: "neutral", known: false };

function describe<K extends string>(map: Readonly<Record<K, readonly [string, StatusTone]>>, raw: unknown): StatusDescriptor {
  if (typeof raw !== "string" || !Object.prototype.hasOwnProperty.call(map, raw)) return UNKNOWN;
  const [labelKey, tone] = map[raw as K];
  return { labelKey, tone, known: true };
}

const OUTCOME: Record<AuditOutcome, readonly [string, StatusTone]> = {
  success: ["admin.audit.outcome.success", "success"],
  denied: ["admin.audit.outcome.denied", "danger"],
  conflict: ["admin.audit.outcome.conflict", "warning"],
};

const CATEGORY: Record<AuditCategory, readonly [string, StatusTone]> = {
  verification: ["admin.audit.category.verification", "neutral"],
  coverage: ["admin.audit.category.coverage", "neutral"],
  booking: ["admin.audit.category.booking", "neutral"],
  membership: ["admin.audit.category.membership", "neutral"],
  content: ["admin.audit.category.content", "neutral"],
  payment: ["admin.audit.category.payment", "neutral"],
  support: ["admin.audit.category.support", "neutral"],
  security: ["admin.audit.category.security", "neutral"],
  settings: ["admin.audit.category.settings", "neutral"],
};

export const describeOutcome = (raw: unknown): StatusDescriptor => describe(OUTCOME, raw);
export const describeCategory = (raw: unknown): StatusDescriptor => describe(CATEGORY, raw);

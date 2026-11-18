/**
 * Audit view models. Mirrors I01 `audit_events` (actor/action/target/outcome/
 * correlation). Never carries raw request bodies, secrets, tokens, OTPs or
 * health/contact data.
 */

export type IsoUtc = string;
export type Page<T> = { items: T[]; nextCursor: string | null };

export type AuditCategory =
  | "verification"
  | "coverage"
  | "booking"
  | "membership"
  | "content"
  | "payment"
  | "support"
  | "security"
  | "settings";

export type AuditOutcome = "success" | "denied" | "conflict";

export type AuditActorKind = "admin" | "provider_staff" | "patient" | "system";

/** Allowlisted metadata values: short primitives only. */
export type AuditMetadataValue = string | number | boolean | null;

export type AuditEvent = {
  id: string;
  occurredAt: IsoUtc;
  actor: { profileId: string | null; kind: AuditActorKind };
  action: string;
  category: AuditCategory;
  target: { type: string; id: string };
  /** Organization the event belongs to; drives org-scoped audit access. Null = platform-level. */
  organizationId: string | null;
  outcome: AuditOutcome;
  reasonCode: string | null;
  /** Admin-entered decision reason, already redacted for contact data and tokens. */
  reason: string | null;
  correlationId: string;
  metadata: Record<string, AuditMetadataValue>;
};

/** What the server (or a fixture) hands to the redactor: anything may be present. */
export type RawAuditEvent = Omit<AuditEvent, "metadata" | "reason"> & {
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

export type AuditFilter = {
  category?: AuditCategory;
  outcome?: AuditOutcome;
  action?: string;
  actorProfileId?: string;
  targetType?: string;
  targetId?: string;
  from?: IsoUtc;
  to?: IsoUtc;
  cursor?: string;
};

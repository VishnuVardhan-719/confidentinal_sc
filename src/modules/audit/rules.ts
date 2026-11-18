import { z } from "zod";
import { can, type AdminPrincipal } from "@/modules/admin/capabilities";
import type { AuditEvent, AuditFilter, AuditMetadataValue, RawAuditEvent } from "./types";

// ---------------------------------------------------------------------------
// Redaction: allowlist metadata keys, drop everything else, and scrub values.
// ---------------------------------------------------------------------------

/** Only these metadata keys may ever reach the UI. Everything else is dropped. */
export const AUDIT_METADATA_ALLOWLIST = [
  "decision",
  "fromState",
  "toState",
  "reasonCode",
  "version",
  "flag",
  "locale",
  "revision",
  "capability",
  "category",
  "documentKind",
  "branchLocationId",
  "resourceId",
] as const;

const ALLOWED = new Set<string>(AUDIT_METADATA_ALLOWLIST);

const REDACTED = "[redacted]";
const MAX_VALUE = 120;

const SECRET_PATTERNS: readonly RegExp[] = [
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, // JWT
  /\bBearer\s+\S+/i,
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}/, // API key shapes
  /\b[A-Fa-f0-9]{32,}\b/, // long hex secrets/hashes
  /\b[A-Za-z0-9+/_-]{40,}={0,2}/, // long base64-like tokens
];

const PII_PATTERNS: readonly RegExp[] = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // email
  /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/, // Indian mobile
  /\b\d{4}\s?\d{4}\s?\d{4}\b/, // 12-digit ID shapes
  /\b\d{6}\b/, // OTP or PIN-length numeric codes
];

function scrubString(value: string): string {
  let out = value;
  for (const pattern of [...SECRET_PATTERNS, ...PII_PATTERNS]) {
    out = out.replace(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`), REDACTED);
  }
  return out.length > MAX_VALUE ? `${out.slice(0, MAX_VALUE)}…` : out;
}

function scrubValue(value: unknown): AuditMetadataValue | undefined {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return scrubString(value);
  return undefined; // objects, arrays, functions: never forwarded
}

export function redactMetadata(raw: Record<string, unknown> | undefined): Record<string, AuditMetadataValue> {
  const out: Record<string, AuditMetadataValue> = {};
  if (!raw) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!ALLOWED.has(key)) continue;
    const clean = scrubValue(value);
    if (clean !== undefined) out[key] = clean;
  }
  return out;
}

/** Produces the UI-safe audit event. Free-text reason is scrubbed; payload keys are allowlisted. */
export function redactAuditEvent(raw: RawAuditEvent): AuditEvent {
  return {
    id: raw.id,
    occurredAt: raw.occurredAt,
    actor: { profileId: raw.actor.profileId, kind: raw.actor.kind },
    action: raw.action,
    category: raw.category,
    target: { type: raw.target.type, id: raw.target.id },
    organizationId: raw.organizationId,
    outcome: raw.outcome,
    reasonCode: raw.reasonCode,
    reason: typeof raw.reason === "string" ? scrubString(raw.reason) : null,
    correlationId: raw.correlationId,
    metadata: redactMetadata(raw.metadata),
  };
}

// ---------------------------------------------------------------------------
// Filters: structured, safe filters only (no free-text payload search).
// ---------------------------------------------------------------------------

export const auditFilterSchema = z.strictObject({
  category: z.enum(["verification", "coverage", "booking", "membership", "content", "payment", "support", "security", "settings"]).optional(),
  outcome: z.enum(["success", "denied", "conflict"]).optional(),
  action: z.string().regex(/^[a-z_]+(?:\.[a-z_]+)*$/).max(80).optional(),
  actorProfileId: z.string().min(1).max(64).optional(),
  targetType: z.string().regex(/^[a-z_]+$/).max(40).optional(),
  targetId: z.string().min(1).max(64).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  cursor: z.string().max(200).optional(),
}).refine((f) => f.from === undefined || f.to === undefined || Date.parse(f.from) <= Date.parse(f.to), { path: ["to"] });

export function applyAuditFilter(events: readonly AuditEvent[], filter: AuditFilter): AuditEvent[] {
  const from = filter.from === undefined ? -Infinity : Date.parse(filter.from);
  const to = filter.to === undefined ? Infinity : Date.parse(filter.to);
  return events
    .filter((e) => {
      const t = Date.parse(e.occurredAt);
      return (
        (filter.category === undefined || e.category === filter.category) &&
        (filter.outcome === undefined || e.outcome === filter.outcome) &&
        (filter.action === undefined || e.action === filter.action) &&
        (filter.actorProfileId === undefined || e.actor.profileId === filter.actorProfileId) &&
        (filter.targetType === undefined || e.target.type === filter.targetType) &&
        (filter.targetId === undefined || e.target.id === filter.targetId) &&
        t >= from &&
        t <= to
      );
    })
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
}

// ---------------------------------------------------------------------------
// Scope: security:audit, global or per organization. Deny by default.
// ---------------------------------------------------------------------------

export function scopedAuditEvents(admin: AdminPrincipal | null | undefined, events: readonly AuditEvent[], now: Date = new Date()): AuditEvent[] {
  return events.filter((e) =>
    e.organizationId === null ? can(admin, "security:audit", { now }) : can(admin, "security:audit", { organizationId: e.organizationId, now }),
  );
}

/** True when the admin holds any live security:audit grant (global or for some organization). */
export function canReadAudit(admin: AdminPrincipal | null | undefined, now: Date = new Date()): boolean {
  if (!admin) return false;
  return admin.grants.some((g) =>
    g.capability === "security:audit" &&
    can(admin, "security:audit", g.scope.kind === "organization" ? { organizationId: g.scope.organizationId, now } : { now }),
  );
}

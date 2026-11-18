import type { ApiResult } from "@/lib/api/result";
import type { AmendmentRequest, SignRequest } from "./schemas";
import type { Consultation, SignedConsultation } from "./types";

/**
 * Sign / amend with uncertain-outcome recovery (DC07).
 * One idempotency key per user intent, reused across retries. If the response is lost
 * (unavailable), refetch the authoritative consultation before offering a retry.
 */
export type SignOutcome =
  | { kind: "signed"; record: SignedConsultation }
  /** Draft changed or record already signed/amended by another intent: refetch and review. */
  | { kind: "conflict" }
  | { kind: "invalid"; fields: Record<string, string> }
  | { kind: "denied" }
  | { kind: "gated" }
  | { kind: "signin" }
  /** Server state unknown/unchanged after a lost response: retry with the SAME key. */
  | { kind: "uncertain"; retryAfterSeconds?: number };

export type SignDeps = {
  getConsultation: (consultationId: string) => Promise<ApiResult<Consultation>>;
};

export const newIntentKey = (): string => globalThis.crypto.randomUUID();

async function recover(deps: SignDeps, id: string, isDone: (c: SignedConsultation) => boolean): Promise<SignOutcome> {
  const latest = await deps.getConsultation(id).catch(() => null);
  if (latest?.ok && latest.data.status === "final") {
    // Final but not provably ours (e.g. a different amendment landed): review before any retry.
    return latest.data.consultationId === id && isDone(latest.data) ? { kind: "signed", record: latest.data } : { kind: "conflict" };
  }
  return { kind: "uncertain" };
}

/** Key-order independent structural equality for parsed JSON content. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * After a lost amendment response the readback proves this intent only if the CURRENT signed
 * version is an amendment of our base, with our reason, and exactly our content. Matching
 * reason metadata alone, or a historical match under a newer version, is a conflict to review.
 * (A server intent id would make this exact; requested in docs/frontend/REQUESTS.md.)
 */
export function isOurAmendment(c: SignedConsultation, input: AmendmentRequest): boolean {
  const current = c.versions[c.versions.length - 1];
  if (!current || current.version !== c.currentVersion) return false;
  const record = c.amendments.find((a) => a.version === c.currentVersion);
  if (!record) return false;
  return (
    record.previousVersion === input.baseVersion &&
    record.reason === input.reason &&
    record.reasonText === input.reasonText &&
    canonical(current.content) === canonical(input.content)
  );
}

/** First signing only: a record that was already amended was not produced by this finalize intent. */
const isFirstSigning = (c: SignedConsultation): boolean => c.versions.length === 1 && c.amendments.length === 0;

async function interpret(r: ApiResult<SignedConsultation> | null, deps: SignDeps, id: string, isDone: (c: SignedConsultation) => boolean): Promise<SignOutcome> {
  if (r === null) return recover(deps, id, isDone);
  if (r.ok) return { kind: "signed", record: r.data };
  switch (r.error.code) {
    case "conflict":
      return { kind: "conflict" };
    case "validation":
      return { kind: "invalid", fields: r.error.fields ?? {} };
    case "forbidden":
    case "not_found":
      return { kind: "denied" };
    case "gated":
      return { kind: "gated" };
    case "unauthenticated":
      return { kind: "signin" };
    case "rate_limited":
      return { kind: "uncertain", retryAfterSeconds: r.error.retryAfterSeconds };
    case "unavailable":
      return recover(deps, id, isDone);
  }
}

export async function finalizeWithRecovery(
  deps: SignDeps & { finalize: (id: string, input: SignRequest, key: string) => Promise<ApiResult<SignedConsultation>> },
  consultationId: string,
  input: SignRequest,
  idempotencyKey: string,
): Promise<SignOutcome> {
  const r = await deps.finalize(consultationId, input, idempotencyKey).catch(() => null);
  return interpret(r, deps, consultationId, isFirstSigning);
}

export async function amendWithRecovery(
  deps: SignDeps & { amend: (id: string, input: AmendmentRequest, key: string) => Promise<ApiResult<SignedConsultation>> },
  consultationId: string,
  input: AmendmentRequest,
  idempotencyKey: string,
): Promise<SignOutcome> {
  const r = await deps.amend(consultationId, input, idempotencyKey).catch(() => null);
  return interpret(r, deps, consultationId, (c) => isOurAmendment(c, input));
}

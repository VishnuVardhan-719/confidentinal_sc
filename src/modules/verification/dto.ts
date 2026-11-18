import { z } from "zod";
import { providerCategorySchema } from "@/modules/auth/roles";
import { parseDocumentStatus, type ProviderReviewDetail } from "./schemas";
import { parseProviderStatus, providerStatusFromServer } from "./status";

/**
 * Wire DTOs from I02 (`task/I02-provider-onboarding`) route handlers. Parsed with
 * non-strict objects so extra server columns are dropped, never forwarded to the UI.
 * Status strings stay `string` here and are mapped through status.ts (unknown -> unknown).
 */

/** Row returned by I02 provider commands (`update_provider`, `submit_provider`, `review_provider`). */
export const providerRowSchema = z.object({
  id: z.uuid(),
  category: providerCategorySchema,
  verification_state: z.string(),
  status: z.string(),
  version: z.int().positive(),
});

export const providerRowEnvelopeSchema = z.object({ provider: providerRowSchema });

/** GET /api/providers/:id */
export const providerReadSchema = z.object({
  provider: providerRowSchema.extend({
    profile: z.object({ display_name: z.string(), description: z.string() }).nullable(),
    documents: z
      .array(
        z.object({
          id: z.uuid(),
          kind: z.string(),
          status: z.string(),
          expires_at: z.string(),
          created_at: z.string(),
        }),
      )
      .nullable(),
    events: z
      .array(
        z.object({
          from_state: z.string(),
          to_state: z.string(),
          public_reason: z.string(),
          provider_version: z.int(),
          occurred_at: z.string(),
        }),
      )
      .nullable(),
  }),
});
export type ProviderRead = z.infer<typeof providerReadSchema>["provider"];

const DOC_KINDS = new Set(["identity", "registration", "licence", "vehicle_permit", "background_check"]);

export function reviewDetailFromRead(p: ProviderRead): ProviderReviewDetail {
  return {
    providerId: p.id,
    category: p.category,
    status: providerStatusFromServer({ verificationState: p.verification_state, operationalStatus: p.status }),
    version: p.version,
    displayName: p.profile?.display_name ?? null,
    description: p.profile?.description ?? null,
    documents: (p.documents ?? []).map((d) => ({
      id: d.id,
      kind: DOC_KINDS.has(d.kind) ? (d.kind as ProviderReviewDetail["documents"][number]["kind"]) : "unknown",
      status: parseDocumentStatus(d.status),
      expiresAt: d.expires_at,
      createdAt: d.created_at,
    })),
    events: (p.events ?? []).map((e) => ({
      fromState: parseProviderStatus(e.from_state),
      toState: parseProviderStatus(e.to_state),
      publicReason: e.public_reason,
      providerVersion: e.provider_version,
      occurredAt: e.occurred_at,
    })),
  };
}

export const rowStatus = (row: z.infer<typeof providerRowSchema>) =>
  providerStatusFromServer({ verificationState: row.verification_state, operationalStatus: row.status });

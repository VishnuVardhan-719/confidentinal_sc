import { z } from "zod";
import { providerCategorySchema } from "@/modules/auth/roles";
import type { ProviderStatusDisplay } from "./status";

/** Private verification evidence kinds (I02 `provider_documents.kind`). */
export const DOCUMENT_KINDS = ["identity", "registration", "licence", "vehicle_permit", "background_check"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const documentKindSchema = z.enum(DOCUMENT_KINDS);

export const DOCUMENT_CONTENT_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const documentContentTypeSchema = z.enum(DOCUMENT_CONTENT_TYPES);

/** I02 upload limit (10 MiB). Server re-validates type/size; this is only early feedback. */
export const MAX_DOCUMENT_BYTES = 10_485_760;

export const DOCUMENT_STATUSES = ["pending", "verified", "rejected", "superseded"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number] | "unknown";
export const parseDocumentStatus = (raw: unknown): DocumentStatus =>
  typeof raw === "string" && (DOCUMENT_STATUSES as readonly string[]).includes(raw) ? (raw as DocumentStatus) : "unknown";

export const expectedVersionSchema = z.int().positive().max(2_147_483_646);
export const reasonSchema = z.string().trim().min(1).max(1000);

/** Admin decisions the UI offers. `changes_required` has no I02 contract yet (HTTP adapter returns gated). */
export const REVIEW_DECISIONS = ["approve", "reject", "changes_required", "suspend"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];
export const reviewDecisionSchema = z.enum(REVIEW_DECISIONS);

export const adminReviewSchema = z.strictObject({
  decision: reviewDecisionSchema,
  reason: reasonSchema,
  expectedVersion: expectedVersionSchema,
});
export type AdminReviewInput = z.infer<typeof adminReviewSchema>;

/** I02 requires moving submitted -> under_review before any decision. */
export const startReviewSchema = z.strictObject({
  reason: reasonSchema,
  expectedVersion: expectedVersionSchema,
});
export type StartReviewInput = z.infer<typeof startReviewSchema>;

/** Decisions permitted from a status (mirrors I02 review_provider transitions; server is authoritative). */
export function allowedDecisions(status: ProviderStatusDisplay): readonly ReviewDecision[] {
  switch (status) {
    case "under_review":
      return ["approve", "reject", "changes_required"];
    case "approved":
    case "active":
      return ["suspend"];
    default:
      return [];
  }
}

export const canStartReview = (status: ProviderStatusDisplay): boolean =>
  status === "submitted" || status === "suspended";

export type ReviewDocumentView = {
  id: string;
  kind: DocumentKind | "unknown";
  status: DocumentStatus;
  expiresAt: string;
  createdAt: string;
};

export type ReviewEventView = {
  fromState: ProviderStatusDisplay;
  toState: ProviderStatusDisplay;
  /** Server-authored public reason. Render as text only, never as HTML. */
  publicReason: string;
  providerVersion: number;
  occurredAt: string;
};

export type ProviderReviewDetail = {
  providerId: string;
  category: z.infer<typeof providerCategorySchema>;
  status: ProviderStatusDisplay;
  version: number;
  displayName: string | null;
  description: string | null;
  documents: ReviewDocumentView[];
  events: ReviewEventView[];
};

export type ReviewQueueItem = {
  providerId: string;
  category: z.infer<typeof providerCategorySchema>;
  status: ProviderStatusDisplay;
  displayName: string;
  submittedAt: string;
};

export type ReviewResult = { providerId: string; status: ProviderStatusDisplay; version: number };

/** Short-lived signed URL for a private document. Never log or persist. */
export type SignedDocumentUrl = { url: string; expiresAt: string };

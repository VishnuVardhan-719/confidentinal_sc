import type { ApiResult } from "@/lib/api/result";
import type { DiscardDraftInput, PrescriptionDraft, SaveDraftInput } from "./types";

/**
 * Assigned doctor only. Errors: forbidden (privacy-safe), conflict (booking not completed or stale
 * version), validation, gated. There is no issue/send method by design.
 */
export type PrescriptionDraftsApi = {
  getDraft: (bookingId: string) => Promise<ApiResult<PrescriptionDraft | null>>;
  saveDraft: (bookingId: string, input: SaveDraftInput) => Promise<ApiResult<PrescriptionDraft>>;
  discardDraft: (bookingId: string, input: DiscardDraftInput) => Promise<ApiResult<null>>;
};

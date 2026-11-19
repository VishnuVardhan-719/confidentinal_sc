import type { ApiResult } from "@/lib/api/result";
import type { ConsultationNote, SaveNoteInput, SignOffInput } from "./types";

/**
 * Assigned doctor only. Errors: forbidden (not this doctor's booking, privacy-safe), not_found,
 * conflict (booking not completed, stale version, or already signed off), validation, gated.
 */
export type ConsultationNotesApi = {
  /** null when no note was started yet. */
  getNote: (bookingId: string) => Promise<ApiResult<ConsultationNote | null>>;
  saveDraft: (bookingId: string, input: SaveNoteInput) => Promise<ApiResult<ConsultationNote>>;
  signOff: (bookingId: string, input: SignOffInput) => Promise<ApiResult<ConsultationNote>>;
};

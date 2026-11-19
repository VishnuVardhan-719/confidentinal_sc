import type { ApiResult } from "@/lib/api/result";
import type { MarkReadInput, PatientNotification } from "./types";

export type NotificationsApi = {
  /** Newest first. */
  listMine: () => Promise<ApiResult<PatientNotification[]>>;
  markRead: (input: MarkReadInput) => Promise<ApiResult<{ updated: number }>>;
};

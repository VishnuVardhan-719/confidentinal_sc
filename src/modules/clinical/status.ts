import { describeStatus, type StatusDescriptor } from "./status-core";
import type { DraftStatus } from "./draft-machine";
import type { ConsultationStatus } from "./types";
import type { AssessmentType } from "./schemas";

export const DRAFT_STATUS_MAP: Readonly<Record<DraftStatus, StatusDescriptor>> = {
  saving: { labelKey: "clinical.draft.status.saving", tone: "progress" },
  saved: { labelKey: "clinical.draft.status.saved", tone: "success" },
  unsaved: { labelKey: "clinical.draft.status.unsaved", tone: "warning" },
  offline: { labelKey: "clinical.draft.status.offline", tone: "warning" },
  failed: { labelKey: "clinical.draft.status.failed", tone: "danger" },
  conflict: { labelKey: "clinical.draft.status.conflict", tone: "danger" },
};

/** Clinical record status. Separate badge from booking and payment status. */
export const CONSULTATION_STATUS_MAP: Readonly<Record<ConsultationStatus, StatusDescriptor>> = {
  draft: { labelKey: "clinical.record.status.draft", tone: "neutral" },
  final: { labelKey: "clinical.record.status.final", tone: "success" },
};

export const ASSESSMENT_TYPE_MAP: Readonly<Record<AssessmentType, StatusDescriptor>> = {
  provisional: { labelKey: "clinical.assessment.type.provisional", tone: "info" },
  final: { labelKey: "clinical.assessment.type.final", tone: "neutral" },
};

export const describeDraftStatus = (s: string | null | undefined) => describeStatus(DRAFT_STATUS_MAP, s);
export const describeConsultationStatus = (s: string | null | undefined) => describeStatus(CONSULTATION_STATUS_MAP, s);
export const describeAssessmentType = (s: string | null | undefined) => describeStatus(ASSESSMENT_TYPE_MAP, s);

import type { AdapterMode } from "@/lib/api/mode";
import type { ApiResult } from "@/lib/api/result";
import type {
  AbsenceReason,
  CareActionInput,
  CareAssignment,
  CaregiverProfile,
  CareRequest,
  CareRequestDecision,
  CareService,
  CareShift,
  Page,
  RecurringCarePlanDraft,
  ShiftActionInput,
} from "./types";

/** Typed caretaker/agency module API. Nonclinical, single interval. */
export interface CaretakerApi {
  readonly mode: AdapterMode;
  listServices(): Promise<ApiResult<CareService[]>>;
  /** Agency manager only. Independent caregivers receive `forbidden`. */
  listStaff(): Promise<ApiResult<CaregiverProfile[]>>;
  listRequests(input?: { cursor?: string }): Promise<ApiResult<Page<CareRequest>>>;
  /** Manual accept with one verified caregiver who covers every requested task, or decline with a reason. */
  decideRequest(input: CareRequestDecision): Promise<ApiResult<CareRequest>>;
  listAssignments(): Promise<ApiResult<CareAssignment[]>>;
  getAssignment(assignmentId: string): Promise<ApiResult<CareAssignment>>;
  performCareAction(input: CareActionInput): Promise<ApiResult<CareAssignment>>;
  listShifts(input: { assignmentId: string }): Promise<ApiResult<CareShift[]>>;
  checkIn(input: ShiftActionInput): Promise<ApiResult<CareShift>>;
  checkOut(input: ShiftActionInput): Promise<ApiResult<CareShift>>;
  reportAbsence(input: ShiftActionInput & { reason: AbsenceReason }): Promise<ApiResult<CareShift>>;
  assignReplacement(input: ShiftActionInput & { replacementResourceId: string }): Promise<ApiResult<CareShift>>;
  /** Gated: always `gated` until the scheduler and recurring-care policy are approved. */
  createRecurringPlan(input: { assignmentId: string; plan: RecurringCarePlanDraft; idempotencyKey: string }): Promise<ApiResult<never>>;
}

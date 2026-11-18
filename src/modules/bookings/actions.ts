import type { Category } from "@/modules/catalog/schemas";
import { bookingStatusSchema, type DoctorOperationalStatus } from "./schemas";
export const BOOKING_ACTIONS = ["submit", "accept", "decline", "cancel", "en_route", "arrive", "verify_arrival", "start_consultation", "complete"] as const;
export type BookingAction = (typeof BOOKING_ACTIONS)[number];
export type ActorRole = "patient" | Category | "admin";
export type ActionAvailability = { action: BookingAction; enabled: boolean; disabledReasonKey?: "booking.action.wrongActor" | "booking.action.invalidState" | "booking.action.authorizationRequired" | "booking.action.clinicalGated" };
export type BookingActionState = { status: string; category: Category; doctorOperationalStatus?: DoctorOperationalStatus | null;
  /** Separate server-confirmed proof; never inferred from a B01 operational phase. */
  arrivalVerified?: boolean; serverAllowedActions?: readonly BookingAction[]; clinicalEnabled?: boolean };
/** Presentation hints only. Server grants represent current assignment/membership/policy checks;
 * Operational completion never implies a signed clinical record.
 * Absent grants fail closed. Every mutation must still be independently authorized by server. */
export function permittedActions(state: BookingActionState, actorRole: ActorRole): ActionAvailability[] {
  const active = ["DRAFT", "REQUESTED", "ACCEPTED", "CONFIRMED"].includes(state.status);
  const validStatus = bookingStatusSchema.safeParse(state.status).success;
  const doctor = actorRole === "doctor" && state.category === "doctor";
  return BOOKING_ACTIONS.map(action => {
    const owner = action === "submit" ? actorRole === "patient" : action === "cancel" ? actorRole === "patient" || actorRole === state.category
      : ["accept", "decline", "complete"].includes(action) ? actorRole === state.category : doctor;
    const allowedState = action === "submit" ? state.status === "DRAFT" : ["accept", "decline"].includes(action) ? state.status === "REQUESTED"
      : action === "cancel" ? active : action === "en_route" ? state.status === "CONFIRMED" && state.doctorOperationalStatus === "SCHEDULED"
      : action === "arrive" ? state.status === "CONFIRMED" && state.doctorOperationalStatus === "EN_ROUTE"
      : action === "verify_arrival" ? state.status === "CONFIRMED" && state.doctorOperationalStatus === "ARRIVED"
      : action === "start_consultation" ? state.status === "CONFIRMED" && state.doctorOperationalStatus === "ARRIVED" && state.arrivalVerified === true
      : state.status === "IN_PROGRESS";
    const clinical = ["verify_arrival", "start_consultation"].includes(action);
    const reason = !owner ? "booking.action.wrongActor" : !validStatus || !allowedState ? "booking.action.invalidState"
      : clinical && !state.clinicalEnabled ? "booking.action.clinicalGated" : !state.serverAllowedActions?.includes(action) ? "booking.action.authorizationRequired" : undefined;
    return { action, enabled: !reason, ...(reason ? { disabledReasonKey: reason } : {}) };
  });
}

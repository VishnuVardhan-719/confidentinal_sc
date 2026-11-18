import { fail, type ApiResult } from "@/lib/api/result";
import { isEnabled } from "@/lib/feature-flags";

/**
 * Emergency dispatch: a future, separate operational module. Hard-gated.
 *
 * - Gate: isEnabled("emergencyDispatch"). OFF by default.
 * - Even with the flag ON there is no staffed dispatch, contract or approval
 *   (BUSINESS_RULES release matrix), so dispatch stays unavailable (S01 A2:
 *   behaviour with the flag ON is identical to OFF).
 * - The types below have no ETA, countdown, location or tracking fields, and
 *   `dispatchAvailable` is the literal `false`, so no code path can produce them.
 * - Calling 112 never depends on this module, an account, a booking or payment.
 */
export type EmergencyGuidance = {
  readonly dispatchAvailable: false;
  readonly reason: "gate_off" | "not_operational";
  readonly callNumber: "112";
  /** Message key (namespace `ambulance`) telling the user to call 112 now. */
  readonly messageKey: "ambulance.emergency.call112";
};

export function getEmergencyGuidance(env: Record<string, string | undefined> = process.env): EmergencyGuidance {
  return {
    dispatchAvailable: false,
    reason: isEnabled("emergencyDispatch", env) ? "not_operational" : "gate_off",
    callNumber: "112",
    messageKey: "ambulance.emergency.call112",
  };
}

/** Always the stable `gated` error. There is no dispatch endpoint and none may be faked. */
export async function requestEmergencyDispatch(): Promise<ApiResult<never>> {
  return fail("gated");
}

import "server-only";
import { journeyApis } from "@/modules/bookings/journey";
import type { PatientApi } from "@/modules/patient/api";

/**
 * The patient API these request flows read members and addresses from. In fixture mode it is the same synthetic
 * marketplace the doctor journey uses, so an address added there is offered here too. Build per request and
 * check the patient session first.
 */
export function servicePatientApi(env: Record<string, string | undefined> = process.env): PatientApi {
  return journeyApis(env).patient;
}

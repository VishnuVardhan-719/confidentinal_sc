import { z } from "zod";
import { fail, type ApiResult } from "@/lib/api/result";
import { getAdapterMode } from "@/lib/api/mode";
import type { FixtureEnvironment } from "@/lib/api/fixture";
import { createPatientFixtureApi } from "./fixture";
import { offerRequestSchema, type BookingOffer, type OfferRequest, type PatientAddress, type PatientMember, type PatientOverview } from "./schemas";

export interface PatientApi {
  getOverview(): Promise<ApiResult<PatientOverview>>;
  listMembers(): Promise<ApiResult<{ items: PatientMember[] }>>;
  listAddresses(): Promise<ApiResult<{ items: PatientAddress[] }>>;
  /** Fresh server price/policy for a schedule; must be re-requested when any input changes. */
  getOffer(input: OfferRequest): Promise<ApiResult<BookingOffer>>;
}

/** No patient profile, family-grant, address or offer/policy read contract exists on inspected
 * backend refs (REQUESTS.md). The HTTP adapter fails closed instead of guessing endpoints. */
export function createPatientHttpApi(): PatientApi {
  return {
    async getOverview() { return fail("gated"); },
    async listMembers() { return fail("gated"); },
    async listAddresses() { return fail("gated"); },
    async getOffer(input) { return fail(offerRequestSchema.safeParse(input).success ? "gated" : "validation"); },
  };
}

export function createPatientApi(env?: FixtureEnvironment): PatientApi {
  return getAdapterMode(env) === "fixture" ? createPatientFixtureApi({ env }) : createPatientHttpApi();
}
export const patientIdSchema = z.uuid();

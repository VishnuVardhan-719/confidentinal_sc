import { fail, type ApiResult } from "@/lib/api/result";
import { createHttp, idSegment, type HttpOptions } from "@/modules/clinical/http-util";
import type { DoctorApi } from "./api";
import { acceptInputSchema, advanceInputSchema, declineInputSchema, otpCodeSchema, versionResponseSchema, type VersionResponse } from "./types";

/**
 * HTTP adapter.
 * Implemented against B01 routes: accept, en-route, arrive, start (body { expectedVersion }, response { version }).
 * Returns fail("gated") where no agreed contract exists yet (see docs/frontend/REQUESTS.md):
 * doctor-view list/detail DTOs, arrival challenge read/resend, verify-arrival body/response.
 */
export function createDoctorHttpApi(options: HttpOptions): DoctorApi {
  const request = createHttp(options);

  const command = async (bookingId: string, action: "accept" | "decline" | "en-route" | "arrive" | "start", body: unknown): Promise<ApiResult<VersionResponse>> => {
    const id = idSegment(bookingId);
    if (!id) return fail("not_found");
    return request({ method: "POST", path: `/api/bookings/${id}/${action}`, body, schema: versionResponseSchema });
  };

  return {
    listRequests: async () => fail("gated"),
    listVisits: async () => fail("gated"),
    getVisit: async () => fail("gated"),
    accept: async (bookingId, input) => {
      const parsed = acceptInputSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      return command(bookingId, "accept", parsed.data);
    },
    decline: async (bookingId, input) => {
      const parsed = declineInputSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      return command(bookingId, "decline", parsed.data);
    },
    // B01 only has POST /api/provider/booking/resources (upsert); no list route yet.
    listAcceptResources: async () => fail("gated"),
    enRoute: async (bookingId, input) => {
      const parsed = advanceInputSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      return command(bookingId, "en-route", parsed.data);
    },
    arrive: async (bookingId, input) => {
      const parsed = advanceInputSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      return command(bookingId, "arrive", parsed.data);
    },
    getArrivalChallenge: async () => fail("gated"),
    resendArrivalCode: async () => fail("gated"),
    verifyArrival: async (_bookingId, input) => {
      // Validate locally so malformed input never leaves the form, then stop: the
      // verify-arrival contract (body/response/error codes) is not agreed yet.
      if (!otpCodeSchema.safeParse(input.code).success) return fail("validation", { fields: { code: "otp_format" } });
      return fail("gated");
    },
    startConsultation: async (bookingId, input) => {
      const parsed = advanceInputSchema.safeParse(input);
      if (!parsed.success) return fail("validation");
      return command(bookingId, "start", parsed.data);
    },
  };
}

import "server-only";
import { getAdapterMode } from "@/lib/api/mode";
import { SYNTHETIC_CANCELLATION_POLICY, sharedSyntheticMarketplace } from "@/fixtures/marketplace/booking-store";
import { createPatientHttpApi, type PatientApi } from "@/modules/patient/api";
import { createPatientFixtureApi } from "@/modules/patient/fixture";
import type { PaymentsApi } from "@/modules/payments/api";
import { createPaymentsFixtureApi } from "@/modules/payments/fixture";
import { createPaymentsHttpApi } from "@/modules/payments/http";
import { createDoctorSearchApi, type DoctorSearchApi } from "@/modules/providers/doctor-api";
import type { BookingsApi } from "./api";
import { createBookingsFixtureApi } from "./fixture";
import { createSessionHttpClient } from "@/modules/auth/session-token";
import { createBookingsHttpApi } from "./http";
import { createSlotsFixtureApi, createSlotsHttpApi, type SlotsApi } from "./slots";

/** Cancellation terms the page may show. Null when no server contract supplies them (http mode today): fail closed. */
export type JourneyCancellationTerms = { version: string; cancelWindowMinutes: number };

export type JourneyApis = {
  bookings: BookingsApi; payments: PaymentsApi; patient: PatientApi; slots: SlotsApi; doctors: Pick<DoctorSearchApi, "get">;
  cancellationTerms: JourneyCancellationTerms | null;
};

/**
 * Server-only APIs for the patient booking journey (/patient/book). In fixture mode every adapter reads the
 * one shared synthetic marketplace, so a request made in one server action is visible to the next page load.
 * In http mode the adapters are the real ones and every capability without a backend contract fails closed.
 * Build per request; callers must check the patient session first.
 */
export function journeyApis(env: Record<string, string | undefined> = process.env): JourneyApis {
  const doctors = createDoctorSearchApi(env);
  if (getAdapterMode(env) !== "fixture") {
    return { bookings: createBookingsHttpApi(createSessionHttpClient()), payments: createPaymentsHttpApi(), patient: createPatientHttpApi(), slots: createSlotsHttpApi(), doctors, cancellationTerms: null };
  }
  const store = sharedSyntheticMarketplace(env);
  return {
    bookings: createBookingsFixtureApi({ env, store, cancellationPolicy: { ...SYNTHETIC_CANCELLATION_POLICY } }),
    payments: createPaymentsFixtureApi({ env, store }),
    patient: createPatientFixtureApi({ env, store }),
    slots: createSlotsFixtureApi({ env, store }),
    doctors,
    cancellationTerms: { version: "synthetic-v1", cancelWindowMinutes: SYNTHETIC_CANCELLATION_POLICY.cancelWindowMinutes },
  };
}

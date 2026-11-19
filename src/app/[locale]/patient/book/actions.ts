"use server";

import { z } from "zod";
import { fail, ok, type ApiResult } from "@/lib/api/result";
import type { Booking, CreateBooking } from "@/modules/bookings/schemas";
import { journeyApis, type JourneyApis } from "@/modules/bookings/journey";
import type { Slot } from "@/modules/bookings/slots";
import { reviewStepSchema } from "@/modules/bookings/wizard";
import { getPatientSession } from "@/modules/patient-dashboard/session";
import type { BookingOffer, PatientAddress } from "@/modules/patient/schemas";

/**
 * Server actions for the patient booking journey. Every action re-checks the patient session and builds
 * request-scoped APIs; the browser never chooses price, status, role or adapter mode. Inputs are validated by
 * the module adapters (unknown is passed through to them, not trusted). Errors become stable codes only.
 */
async function guarded<T>(run: (apis: JourneyApis) => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  if ((await getPatientSession()).status !== "ok") return fail("unauthenticated");
  try { return await run(journeyApis()); } catch { return fail("unavailable"); }
}

export async function bookingOfferAction(input: unknown): Promise<ApiResult<BookingOffer>> {
  return guarded(apis => apis.patient.getOffer(input as never));
}

export async function addAddressAction(input: unknown): Promise<ApiResult<{ id: string; items: PatientAddress[] }>> {
  return guarded(async apis => {
    const added = await apis.patient.addAddress(input as never);
    if (!added.ok) return added;
    const list = await apis.patient.listAddresses();
    return list.ok ? ok({ id: added.data.id, items: list.data.items }) : list;
  });
}

export async function listSlotsAction(input: unknown): Promise<ApiResult<{ items: Slot[] }>> {
  return guarded(apis => apis.slots.list(input as never));
}

/**
 * Re-checks the reviewed offer against a fresh server offer before anything is created. A changed price,
 * terms or policy is a conflict, so the patient must review again; nothing from the browser sets the price.
 */
export async function prepareBookingAction(input: unknown): Promise<ApiResult<CreateBooking>> {
  return guarded(async apis => {
    const review = reviewStepSchema.safeParse(input);
    if (!review.success) return fail("validation");
    const { service, location, schedule, paymentPolicy, details, patient } = review.data;
    const offer = await apis.patient.getOffer({ ...service, pin: location.pin, startAt: schedule.startAt, endAt: schedule.endAt });
    if (!offer.ok) return offer;
    const price = offer.data.priceSnapshot;
    if (price.amountPaise !== paymentPolicy.priceSnapshot.amountPaise || price.termsVersion !== paymentPolicy.priceSnapshot.termsVersion
      || price.policyVersionId !== paymentPolicy.approvedPolicyVersionId || offer.data.noticeVersion !== paymentPolicy.noticeVersion
      || !offer.data.paymentMethods.includes(paymentPolicy.method)) return fail("conflict");
    const visitReason = details.category === "doctor" && details.visitReason ? details.visitReason : undefined;
    return ok({ patientId: patient.patientId, serviceId: service.serviceId, addressId: location.addressId, startAt: schedule.startAt, ...(visitReason ? { visitReason } : {}) });
  });
}

export async function createBookingAction(input: unknown, idempotencyKey: unknown): Promise<ApiResult<{ id: string }>> {
  if (typeof idempotencyKey !== "string") return fail("validation");
  return guarded(apis => apis.bookings.create(input as never, idempotencyKey));
}

export async function getBookingAction(id: unknown): Promise<ApiResult<Booking>> {
  if (!z.uuid().safeParse(id).success) return fail("validation");
  return guarded(apis => apis.bookings.get(id as string));
}

/** The patient's own cancellation. The reason is fixed server-side: a patient can only cancel at their own request. */
export async function cancelBookingAction(id: unknown, expectedVersion: unknown): Promise<ApiResult<{ version: number }>> {
  if (!z.uuid().safeParse(id).success) return fail("validation");
  return guarded(apis => apis.bookings.cancel(id as string, { expectedVersion: expectedVersion as number, reason: "patient_request" }));
}

export async function rescheduleBookingAction(id: unknown, expectedVersion: unknown, startAt: unknown): Promise<ApiResult<{ version: number }>> {
  if (!z.uuid().safeParse(id).success) return fail("validation");
  return guarded(apis => apis.bookings.reschedule(id as string, { expectedVersion: expectedVersion as number, startAt: startAt as string }));
}

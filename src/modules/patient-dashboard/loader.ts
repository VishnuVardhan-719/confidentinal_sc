import { fail, type ApiResult } from "@/lib/api/result";
import type { Locale } from "@/lib/format";
import type { BookingsApi } from "@/modules/bookings/api";
import { createPatientBookingLoaders } from "@/modules/bookings/server-loaders";
import { bookingStatusPresentation } from "@/modules/bookings/status";
import type { StatusDescriptor } from "@/modules/clinical/status-core";
import { toPageState, type PageState } from "@/modules/doctor/routing";
import type { PatientApi } from "@/modules/patient/api";
import { profileItemHref } from "@/modules/patient/readiness";
import type { ProfileItemKey } from "@/modules/patient/schemas";
import { paymentSummarySchema } from "@/modules/payments/schemas";
import type { PaymentsApi } from "@/modules/payments/api";
import { paymentStatusPresentation } from "@/modules/payments/status";
import type { RecordsApi } from "@/modules/records/api";
import type { PatientRecordSummary } from "@/modules/records/types";

/**
 * Patient dashboard (FE-C2 item, built in fe2-d). Server-only composition of the fe2-c bookings,
 * payments and patient modules plus the fe2-d records module.
 *
 * Three independent badges per booking: booking state, payment state and clinical-record state.
 * None is inferred from another (a completed booking is not "paid"; a paid booking has no
 * record implied). Anything the server did not report renders as a neutral "unknown/unavailable".
 */
export const MAX_DASHBOARD_BOOKINGS = 5;

export type DashboardBooking = {
  id: string;
  reference: string | null;
  category: string;
  start: string;
  price: string;
  href: string;
  synthetic: boolean;
  booking: StatusDescriptor;
  /** Doctor visit sub-state (on the way, arrived...), only when the server reports one. */
  visit: StatusDescriptor | null;
  payment: StatusDescriptor;
  clinical: StatusDescriptor;
};

export type ProfilePrompt =
  | { kind: "complete" }
  | { kind: "incomplete"; done: number; total: number; missing: { key: ProfileItemKey; href: string }[] }
  /** Overview unavailable/gated or no required items reported: never shown as complete. */
  | { kind: "unknown" };

export type PatientDashboardData = {
  upcoming: PageState<DashboardBooking[]>;
  /** True when more upcoming bookings exist than are shown. */
  moreUpcoming: boolean;
  profile: ProfilePrompt;
};

export type PatientDashboardDeps = {
  authorizePatient: () => Promise<ApiResult<null>>;
  bookings: Pick<BookingsApi, "list" | "get" | "timeline">;
  payments: Pick<PaymentsApi, "getSummary">;
  patient: Pick<PatientApi, "getOverview">;
  records: Pick<RecordsApi, "listMyRecords">;
};

const D = "patient.dashboard";
export const PAYMENT_UNAVAILABLE: StatusDescriptor = { labelKey: `${D}.payment.unavailable`, tone: "neutral" };
export const CLINICAL_OFF: StatusDescriptor = { labelKey: `${D}.clinical.off`, tone: "neutral" };
export const CLINICAL_UNKNOWN: StatusDescriptor = { labelKey: `${D}.clinical.unknown`, tone: "neutral" };
export const CLINICAL_SIGNED: StatusDescriptor = { labelKey: `${D}.clinical.signed`, tone: "success" };
export const CLINICAL_NONE: StatusDescriptor = { labelKey: `${D}.clinical.none`, tone: "neutral" };

/** fe2-c payment labels live under payment.status.*, which has no messages yet; use ours. */
export function paymentBadge(status: string): StatusDescriptor {
  const p = paymentStatusPresentation(status);
  return { labelKey: `${D}.payment.${p.labelKey.replace(/^payment\.status\./, "")}`, tone: p.tone };
}

async function safe<T>(op: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  try {
    return await op();
  } catch {
    return fail("unavailable");
  }
}

async function paymentFor(api: PatientDashboardDeps["payments"], bookingId: string): Promise<StatusDescriptor> {
  const r = await safe(() => api.getSummary(bookingId));
  if (!r.ok) return PAYMENT_UNAVAILABLE;
  const parsed = paymentSummarySchema.safeParse(r.data);
  // A summary for another booking is never shown against this one.
  return parsed.success && parsed.data.bookingId === bookingId ? paymentBadge(parsed.data.status) : PAYMENT_UNAVAILABLE;
}

export function clinicalBadge(records: ApiResult<PatientRecordSummary[]>, reference: string | null): StatusDescriptor {
  if (!records.ok) return records.error.code === "gated" ? CLINICAL_OFF : CLINICAL_UNKNOWN;
  if (!reference) return CLINICAL_UNKNOWN;
  return records.data.some((r) => r.bookingReference === reference) ? CLINICAL_SIGNED : CLINICAL_NONE;
}

export async function loadProfilePrompt(api: PatientDashboardDeps["patient"]): Promise<ProfilePrompt> {
  const r = await safe(() => api.getOverview());
  if (!r.ok) return { kind: "unknown" };
  const required = r.data.completion.filter((i) => i.required);
  if (required.length === 0) return { kind: "unknown" };
  const missing = required.filter((i) => !i.done).map((i) => ({ key: i.key, href: profileItemHref(i.key) }));
  if (missing.length === 0 && r.data.questionnaire === "complete") return { kind: "complete" };
  return { kind: "incomplete", done: required.length - missing.length, total: required.length, missing };
}

export async function loadPatientDashboard(deps: PatientDashboardDeps, locale: Locale, now: Date): Promise<PatientDashboardData> {
  const loaders = createPatientBookingLoaders({ authorizePatient: deps.authorizePatient, api: deps.bookings });
  const [list, records, profile] = await Promise.all([
    loaders.list(locale, now.toISOString(), { limit: 20 }),
    safe(() => deps.records.listMyRecords()),
    loadProfilePrompt(deps.patient),
  ]);
  if (!list.ok) return { upcoming: toPageState<DashboardBooking[]>(list), moreUpcoming: false, profile };

  const shown = list.data.upcoming.slice(0, MAX_DASHBOARD_BOOKINGS);
  const items = await Promise.all(
    shown.map(async (card): Promise<DashboardBooking> => ({
      id: card.id,
      reference: card.reference,
      category: card.category,
      start: card.start,
      price: card.price,
      href: card.href,
      synthetic: card.synthetic,
      booking: bookingStatusPresentation(card.status),
      visit: card.operationalStatus ? bookingStatusPresentation(card.operationalStatus) : null,
      payment: await paymentFor(deps.payments, card.id),
      clinical: clinicalBadge(records, card.reference),
    })),
  );
  return {
    upcoming: items.length === 0 ? { kind: "empty" } : { kind: "ready", data: items },
    moreUpcoming: list.data.upcoming.length > shown.length || list.data.hasMore,
    profile,
  };
}

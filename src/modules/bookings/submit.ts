import { z } from "zod";
import { bookingMatchesReview } from "./review-matching";
export { bookingMatchesReview } from "./review-matching";
import { immutableSnapshot } from "@/lib/api/snapshot";
import { createIdempotencyIntent } from "@/lib/api/idempotency";
import { fail, ok, type ApiError, type ApiResult } from "@/lib/api/result";
import type { BookingsApi } from "./api";
import { bookingSchema, createBookingSchema, type Booking, type CreateBooking } from "./schemas";
import { reviewStepSchema, type BookingReview } from "./wizard";

export type BookingSubmissionState =
  | { phase: "idle" | "preparing" | "submitting" | "disposed" }
  | { phase: "failed"; error: ApiError }
  | { phase: "uncertain"; error: ApiError; knownBookingId?: string }
  | { phase: "review_required"; booking: Booking }
  | { phase: "resolved"; booking: Booking };
export type PrepareBookingReview = (review: BookingReview) => Promise<ApiResult<CreateBooking>>;

/** One controller per active user/workspace and intent. No persistence, offline queue,
 * heuristic list matching or automatic retries. Dispose on logout/workspace change.
 * prepare must verify the approved policy/offer acknowledgment; absent contract gates.
 * After uncertainty, editing/resetting is refused until an explicit reconciliation.
 * A known ID is always read again; an unknown outcome retries the exact key/body. */
export function createBookingSubmitter(options: { api: Pick<BookingsApi, "create" | "get">; prepare?: PrepareBookingReview }) {
  let state: BookingSubmissionState = immutableSnapshot({ phase: "idle" });
  let uncertainCreate = false;
  let input: CreateBooking | undefined;
  let review: BookingReview | undefined;
  let key: string | undefined;
  let knownId: string | undefined;
  let inFlight: Promise<BookingSubmissionState> | undefined;
  let generation = 0;
  const listeners = new Set<() => void>();
  const getSnapshot = (): BookingSubmissionState => state;
  function publish(next: BookingSubmissionState) {
    state = immutableSnapshot(next);
    for (const listener of listeners) listener();
  }
  const active = (version: number) => generation === version && state.phase !== "disposed";
  async function execute(version: number): Promise<BookingSubmissionState> {
    if (!input || !key || !review || !active(version)) return getSnapshot();
    if (!knownId) {
      publish({ phase: "submitting" });
      let result: ApiResult<{ id: string }>;
      try { result = await options.api.create(structuredClone(input), key); } catch { result = fail("unavailable"); }
      if (!active(version)) return getSnapshot();
      if (!result.ok) {
        uncertainCreate ||= result.error.code === "unavailable";
        publish(uncertainCreate ? { phase: "uncertain", error: result.error } : { phase: "failed", error: result.error });
        return getSnapshot();
      }
      const id = z.uuid().safeParse(result.data.id);
      if (!id.success) { uncertainCreate = true; publish({ phase: "uncertain", error: { code: "unavailable" } }); return getSnapshot(); }
      knownId = id.data;
    }
    let fetched: ApiResult<Booking>;
    try { fetched = await options.api.get(knownId); } catch { fetched = fail("unavailable"); }
    if (!active(version)) return getSnapshot();
    if (!fetched.ok) { publish({ phase: "uncertain", knownBookingId: knownId, error: fetched.error }); return getSnapshot(); }
    const booking = bookingSchema.safeParse(fetched.data);
    if (!booking.success || booking.data.id !== knownId) { publish({ phase: "uncertain", knownBookingId: knownId, error: { code: "unavailable" } }); return getSnapshot(); }
    publish(bookingMatchesReview(booking.data, review) ? { phase: "resolved", booking: booking.data } : { phase: "review_required", booking: booking.data });
    return getSnapshot();
  }
  function run(operation: () => Promise<BookingSubmissionState>): Promise<BookingSubmissionState> {
    const version = generation;
    inFlight = operation().finally(() => { if (generation === version) inFlight = undefined; });
    return inFlight;
  }
  return {
    getSnapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    submit(value: unknown): Promise<BookingSubmissionState> {
      if (inFlight) return inFlight;
      if (["disposed", "uncertain", "review_required", "resolved"].includes(state.phase)) return Promise.resolve(getSnapshot());
      const parsed = reviewStepSchema.safeParse(value);
      if (!parsed.success) { publish({ phase: "failed", error: { code: "validation" } }); return Promise.resolve(getSnapshot()); }
      const version = generation;
      // Capture a private immutable intent before awaiting eligibility. Only validated data is retained.
      review = structuredClone(parsed.data);
      publish({ phase: "preparing" });
      return run(async () => {
        let prepared: ApiResult<CreateBooking>;
        try { prepared = options.prepare ? await options.prepare(structuredClone(parsed.data)) : fail("gated"); } catch { prepared = fail("unavailable"); }
        if (!active(version)) return getSnapshot();
        if (!prepared.ok) { publish({ phase: "failed", error: prepared.error }); return getSnapshot(); }
        const body = createBookingSchema.safeParse(prepared.data);
        if (!body.success || body.data.patientId !== parsed.data.patient.patientId || body.data.serviceId !== parsed.data.service.serviceId
          || body.data.addressId !== parsed.data.location.addressId || body.data.startAt !== parsed.data.schedule.startAt) {
          publish({ phase: "failed", error: { code: "conflict" } }); return getSnapshot();
        }
        uncertainCreate = false; input = body.data; key = createIdempotencyIntent().key; knownId = undefined;
        return execute(version);
      });
    },
    reconcile(): Promise<BookingSubmissionState> {
      if (inFlight) return inFlight;
      if (state.phase !== "uncertain" && state.phase !== "review_required") return Promise.resolve(getSnapshot());
      const version = generation;
      return run(() => execute(version));
    },
    reset(): ApiResult<null> {
      if (inFlight || state.phase === "disposed" || ["uncertain", "review_required"].includes(state.phase)) return fail("conflict");
      uncertainCreate = false; input = undefined; review = undefined; key = undefined; knownId = undefined; generation++;
      publish({ phase: "idle" }); return ok(null);
    },
    dispose() {
      generation++; uncertainCreate = false; input = undefined; review = undefined; key = undefined; knownId = undefined; inFlight = undefined;
      publish({ phase: "disposed" }); listeners.clear();
    },
  };
}

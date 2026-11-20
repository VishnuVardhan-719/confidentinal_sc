import { connection } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IdentityError } from "@/lib/auth/identity";
import { endpoint, input, json, session } from "@/lib/auth/http";
import { parse, query, requestKey } from "@/lib/catalog/http";
import { publicAuthClient } from "@/lib/db/request-client";
import { isEnabled } from "@/lib/feature-flags";
import { labCommand, type LabCommand, type LabStep } from "./service";
import {
  collectionFailedSchema, handoffFailedSchema, labAcceptSchema, labAvailabilitySchema, labBookingSchema,
  labFollowupSchema, labFollowupsSchema, labStepSchema, labTestSchema,
} from "@/lib/validation/lab";

type Context = { params: Promise<Record<string, string>> };
type Db = Pick<SupabaseClient, "rpc">;

// Every handler opts out of prerendering first: the env check below runs before the
// request is read, so without this a flag-off 503 would be baked in at build time.
async function begin() { await connection(); }
// FEATURE_LAB is a second key on admission routes only (contract 10.1). Start, closeout,
// reads and configuration are decided by the database gate alone.
function admission() { if (!isEnabled("lab")) throw new IdentityError(503, "feature_unavailable"); }
const id = (params: Record<string, string>, key = "id") => parse(z.uuid(), params[key]);

// A denial rolls back inside the database, so the route logs one line: ids and code only.
async function call(route: string, actor: string, booking: string | null, db: Db, name: LabCommand, args: Record<string, unknown>) {
  try { return await labCommand(db, name, args); }
  catch (error) {
    if (error instanceof IdentityError && (error.status === 403 || error.status === 404)) {
      console.warn(JSON.stringify({ event: "lab.denied", route, actor, booking, code: error.code }));
    }
    throw error;
  }
}

/** GET /api/lab/tests/:serviceId (anon allowed; admission). */
export function publicTestRoute() {
  return async (_request: Request, context: Context) => endpoint(async () => {
    await begin(); admission();
    const service = id(await context.params, "serviceId");
    const test = await labCommand(publicAuthClient(), "get_lab_test_public", { p_service_id: service });
    if (!test) throw new IdentityError(404, "not_found");
    return json({ test });
  });
}
/** GET /api/lab/availability (admission). */
export function slotsRoute() {
  return async (request: Request) => endpoint(async () => {
    await begin(); admission();
    const { db } = await session(request);
    const v = query(request, labAvailabilitySchema);
    return json({ slots: await labCommand(db, "list_lab_slots", { p_service_id: v.service, p_date: v.date }), advisory: true });
  });
}
/** POST /api/lab/bookings (admission). */
export function createRoute() {
  return async (request: Request) => endpoint(async () => {
    await begin(); admission();
    const { db, actor } = await session(request);
    const key = requestKey(request);
    const v = await input(request, labBookingSchema);
    const created = await call("lab.create", actor.userId, null, db, "create_lab_booking_request", { p_patient_id: v.patientId,
      p_service_id: v.serviceId, p_address_id: v.addressId, p_start_at: v.startAt, p_preparation_acknowledged: v.preparationAcknowledged,
      p_request_key: key });
    return json({ id: created }, 201);
  });
}
/** POST /api/bookings/:id/lab/accept (admission). */
export function acceptRoute() {
  return async (request: Request, context: Context) => endpoint(async () => {
    await begin(); admission();
    const { db, actor } = await session(request);
    const booking = id(await context.params);
    const key = requestKey(request);
    const v = await input(request, labAcceptSchema);
    return json({ version: await call("lab.accept", actor.userId, booking, db, "accept_lab_booking",
      { p_booking_id: booking, p_expected_version: v.expectedVersion, p_resource_id: v.resourceId, p_request_key: key }) });
  });
}
/** POST /api/bookings/:id/lab/<step>: one fixed step per route file, never chosen by the client. */
export function stepRoute(step: LabStep) {
  return async (request: Request, context: Context) => endpoint(async () => {
    await begin();
    const { db, actor } = await session(request);
    const booking = id(await context.params);
    const key = requestKey(request);
    const v = step === "collection_failed" ? await input(request, collectionFailedSchema)
      : step === "handoff_failed" ? await input(request, handoffFailedSchema)
        : { ...await input(request, labStepSchema), failureCode: null };
    return json({ version: await call("lab." + step, actor.userId, booking, db, "advance_lab_order", { p_booking_id: booking,
      p_step: step, p_expected_version: v.expectedVersion, p_failure_code: v.failureCode, p_request_key: key }) });
  });
}
/** POST /api/bookings/:id/lab/followup (closeout; provider first-line support). */
export function followupRoute() {
  return async (request: Request, context: Context) => endpoint(async () => {
    await begin();
    const { db, actor } = await session(request);
    const booking = id(await context.params);
    const key = requestKey(request);
    const v = await input(request, labFollowupSchema);
    return json({ followup: await call("lab.followup", actor.userId, booking, db, "lab_close_followup",
      { p_booking_id: booking, p_code: v.code, p_request_key: key }) });
  });
}
/** GET /api/bookings/:id/lab (read). */
export function orderRoute() {
  return async (request: Request, context: Context) => endpoint(async () => {
    await begin();
    const { db, actor } = await session(request);
    const booking = id(await context.params);
    return json({ order: await call("lab.order", actor.userId, booking, db, "get_lab_order", { p_booking_id: booking }) });
  });
}
/** GET /api/provider/lab/followups (read). */
export function followupsRoute() {
  return async (request: Request) => endpoint(async () => {
    await begin();
    const { db, actor } = await session(request);
    const v = query(request, labFollowupsSchema);
    return json({ items: await call("lab.followups", actor.userId, null, db, "list_lab_followups",
      { p_provider_id: v.providerId, p_limit: v.limit, p_after: v.cursor ?? null }) });
  });
}
/** PUT /api/provider/services/:id/lab-test (provider configuration). */
export function labTestRoute() {
  return async (request: Request, context: Context) => endpoint(async () => {
    await begin();
    const { db, actor } = await session(request);
    const service = id(await context.params);
    const key = requestKey(request);
    const v = await input(request, labTestSchema);
    return json({ version: await call("lab.test", actor.userId, null, db, "set_lab_test", { p_service_id: service,
      p_sample_type: v.sampleType, p_container_codes: v.containerCodes, p_fasting_hours: v.fastingHours,
      p_preparation_code: v.preparationCode, p_expected_version: v.expectedVersion, p_request_key: key }) });
  });
}

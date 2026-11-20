import { connection } from "next/server";
import { IdentityError } from "@/lib/auth/identity";
import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { isEnabled } from "@/lib/feature-flags";
import { advanceResultSchema, tripInterruptSchema, tripStepSchema } from "@/lib/validation/ambulance";
import { ambulanceCommand } from "./service";

export type IdContext = { params: Promise<{ id: string }> };

/** FEATURE_SCHEDULED_TRANSPORT is a second key on admission routes only (contract A10.1):
 * slots, request and accept. Off answers 503 before any session or RPC. Closeout, reads,
 * cancel, decline and ops never read it; the database gate decides those. */
export async function admissionOpen() {
  // Opt out of prerendering: the flag is read before the request, so without this an
  // env-off 503 could be fixed at build time.
  await connection();
  if (!isEnabled("scheduledTransport")) throw new IdentityError(503, "feature_unavailable");
}

export type TripStep = "en_route" | "arrived" | "absence" | "picked_up" | "destination_reached" | "interrupt";

/** POST /api/bookings/:id/trip/<step>. The step is fixed by the route file. */
export function tripStepRoute(step: TripStep) {
  return (request: Request, context: IdContext) => endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const body = step === "interrupt" ? await input(request, tripInterruptSchema) : { ...(await input(request, tripStepSchema)), reason: null };
    const data = await ambulanceCommand(db, "advance_trip", { p_booking_id: id, p_step: step, p_expected_version: body.expectedVersion,
      p_request_key: key, p_reason: body.reason });
    const parsed = advanceResultSchema.safeParse(data);
    if (!parsed.success) throw new IdentityError(503, "ambulance_unavailable");
    const result = parsed.data;
    // The papers lapsed: the block was recorded (event and exception) and committed.
    if (result.blocked) return json({ error: { code: result.blocked }, version: result.version }, 409);
    return json({ version: result.version, substate: result.substate });
  });
}

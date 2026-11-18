"use server";

import { authorizeAreaAction, isId, isKey, isVersion } from "@/modules/admin/action-guard";
import { toActionResult, type ActionResult } from "@/modules/admin/action-result";
import { toAmbulanceActor } from "@/modules/admin/workspace";
import { getAmbulanceApi } from "./index";
import { ambulancePath, decideAmbulanceRoute, type AmbulanceRoute } from "./routes";
import { DECLINE_REASONS, TRIP_INTERRUPT_REASONS } from "./rules";
import type { DeclineReason, TripAction, TripInterruptReason } from "./types";

/**
 * Ambulance server actions. Re-authorize the route for the selected workspace,
 * re-validate every argument, then call the typed API (which authorizes again).
 * No action accepts location, coordinates or ETA.
 */

async function api(route: AmbulanceRoute) {
  const auth = await authorizeAreaAction("ambulance", (s, key) => decideAmbulanceRoute(s, route, "en", ambulancePath("en", route), key));
  if (!auth.ok) return auth;
  return { ok: true as const, amb: getAmbulanceApi({ actor: toAmbulanceActor(auth.ctx.workspace) }) };
}

export async function ambulanceAcceptAction(
  bound: { requestId: string; expectedVersion: number },
  form: { vehicleResourceId: string; driverResourceId: string; idempotencyKey: string },
): Promise<ActionResult> {
  if (!isId(bound?.requestId) || !isVersion(bound.expectedVersion) || !isKey(form?.idempotencyKey)) return { ok: false, code: "validation" };
  const fields: Record<string, string> = {};
  if (!isId(form.vehicleResourceId)) fields.vehicleResourceId = "required";
  if (!isId(form.driverResourceId)) fields.driverResourceId = "required";
  if (Object.keys(fields).length) return { ok: false, code: "validation", fields };
  const a = await api("requests");
  if (!a.ok) return a.result;
  return toActionResult(
    await a.amb.decideRequest({
      requestId: bound.requestId,
      decision: "accept",
      vehicleResourceId: form.vehicleResourceId,
      driverResourceId: form.driverResourceId,
      expectedVersion: bound.expectedVersion,
      idempotencyKey: form.idempotencyKey,
    }),
  );
}

export async function ambulanceDeclineAction(bound: { requestId: string; expectedVersion: number }, input: { idempotencyKey: string; reason?: string }): Promise<ActionResult> {
  if (!isId(bound?.requestId) || !isVersion(bound.expectedVersion) || !isKey(input?.idempotencyKey)) return { ok: false, code: "validation" };
  if (!(DECLINE_REASONS as readonly string[]).includes(input.reason ?? "")) return { ok: false, code: "validation", fields: { reason: "required" } };
  const a = await api("requests");
  if (!a.ok) return a.result;
  return toActionResult(
    await a.amb.decideRequest({
      requestId: bound.requestId,
      decision: "decline",
      reason: input.reason as DeclineReason,
      expectedVersion: bound.expectedVersion,
      idempotencyKey: input.idempotencyKey,
    }),
  );
}

const DRIVER_ACTIONS: readonly TripAction[] = ["en_route", "arrived", "picked_up", "destination_reached", "interrupt"];

export async function ambulanceTripAction(
  bound: { tripId: string; action: TripAction; expectedVersion: number },
  input: { idempotencyKey: string; reason?: string },
): Promise<ActionResult> {
  if (!isId(bound?.tripId) || !DRIVER_ACTIONS.includes(bound.action) || !isVersion(bound.expectedVersion) || !isKey(input?.idempotencyKey)) {
    return { ok: false, code: "validation" };
  }
  const isInterrupt = bound.action === "interrupt";
  if (isInterrupt && !(TRIP_INTERRUPT_REASONS as readonly string[]).includes(input.reason ?? "")) return { ok: false, code: "validation", fields: { reason: "required" } };
  const a = await api("driver");
  if (!a.ok) return a.result;
  return toActionResult(
    await a.amb.performTripAction({
      tripId: bound.tripId,
      action: bound.action,
      expectedVersion: bound.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      ...(isInterrupt ? { reason: input.reason as TripInterruptReason } : {}),
    }),
  );
}

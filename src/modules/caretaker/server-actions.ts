"use server";

import { authorizeAreaAction, isId, isKey, isVersion } from "@/modules/admin/action-guard";
import { toActionResult, type ActionResult } from "@/modules/admin/action-result";
import { toCareActor } from "@/modules/admin/workspace";
import { getCaretakerApi } from "./index";
import { caretakerPath, decideCaretakerRoute, type CaretakerRoute } from "./routes";
import { CARE_DECLINE_REASONS, CARE_INTERRUPT_REASONS } from "./rules";
import type { AbsenceReason, CareDeclineReason, CareInterruptReason } from "./types";

/**
 * Caretaker server actions. Re-authorize the route for the selected workspace,
 * re-validate every argument, then call the typed API (which authorizes again).
 * No action accepts a client timestamp or any clinical field.
 */

type Input = { idempotencyKey: string; reason?: string };
const ABSENCE: readonly AbsenceReason[] = ["caregiver_unwell", "caregiver_emergency", "transport_issue", "other"];

async function api(route: CaretakerRoute) {
  const auth = await authorizeAreaAction("caretaker", (s, key) => decideCaretakerRoute(s, route, "en", caretakerPath("en", route), key));
  if (!auth.ok) return auth;
  return { ok: true as const, care: getCaretakerApi({ actor: toCareActor(auth.ctx.workspace) }) };
}

/** `input.reason` carries the chosen caregiver resource id (single-select confirm dialog). */
export async function careAcceptAction(bound: { requestId: string; expectedVersion: number }, input: Input): Promise<ActionResult> {
  if (!isId(bound?.requestId) || !isVersion(bound.expectedVersion) || !isKey(input?.idempotencyKey)) return { ok: false, code: "validation" };
  if (!isId(input.reason)) return { ok: false, code: "validation", fields: { caregiverResourceId: "required" } };
  const form = { caregiverResourceId: input.reason, idempotencyKey: input.idempotencyKey };
  const a = await api("requests");
  if (!a.ok) return a.result;
  return toActionResult(
    await a.care.decideRequest({ requestId: bound.requestId, decision: "accept", caregiverResourceId: form.caregiverResourceId, expectedVersion: bound.expectedVersion, idempotencyKey: form.idempotencyKey }),
  );
}

export async function careDeclineAction(bound: { requestId: string; expectedVersion: number }, input: Input): Promise<ActionResult> {
  if (!isId(bound?.requestId) || !isVersion(bound.expectedVersion) || !isKey(input?.idempotencyKey)) return { ok: false, code: "validation" };
  if (!(CARE_DECLINE_REASONS as readonly string[]).includes(input.reason ?? "")) return { ok: false, code: "validation", fields: { reason: "required" } };
  const a = await api("requests");
  if (!a.ok) return a.result;
  return toActionResult(
    await a.care.decideRequest({ requestId: bound.requestId, decision: "decline", reason: input.reason as CareDeclineReason, expectedVersion: bound.expectedVersion, idempotencyKey: input.idempotencyKey }),
  );
}

export async function careAssignmentAction(bound: { assignmentId: string; action: "start" | "end" | "interrupt"; expectedVersion: number }, input: Input): Promise<ActionResult> {
  if (!isId(bound?.assignmentId) || !["start", "end", "interrupt"].includes(bound.action) || !isVersion(bound.expectedVersion) || !isKey(input?.idempotencyKey)) {
    return { ok: false, code: "validation" };
  }
  const interrupt = bound.action === "interrupt";
  if (interrupt && !(CARE_INTERRUPT_REASONS as readonly string[]).includes(input.reason ?? "")) return { ok: false, code: "validation", fields: { reason: "required" } };
  const a = await api("assignments");
  if (!a.ok) return a.result;
  return toActionResult(
    await a.care.performCareAction({
      assignmentId: bound.assignmentId,
      action: bound.action,
      expectedVersion: bound.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      ...(interrupt ? { reason: input.reason as CareInterruptReason } : {}),
    }),
  );
}

export async function careShiftAction(
  bound: { shiftId: string; step: "check_in" | "check_out" | "absent"; expectedVersion: number },
  input: Input,
): Promise<ActionResult> {
  if (!isId(bound?.shiftId) || !["check_in", "check_out", "absent"].includes(bound.step) || !isVersion(bound.expectedVersion) || !isKey(input?.idempotencyKey)) {
    return { ok: false, code: "validation" };
  }
  if (bound.step === "absent" && !(ABSENCE as readonly string[]).includes(input.reason ?? "")) return { ok: false, code: "validation", fields: { reason: "required" } };
  const a = await api("shifts");
  if (!a.ok) return a.result;
  const args = { shiftId: bound.shiftId, expectedVersion: bound.expectedVersion, idempotencyKey: input.idempotencyKey };
  if (bound.step === "check_in") return toActionResult(await a.care.checkIn(args));
  if (bound.step === "check_out") return toActionResult(await a.care.checkOut(args));
  return toActionResult(await a.care.reportAbsence({ ...args, reason: input.reason as AbsenceReason }));
}

export async function careReplaceAction(bound: { shiftId: string; expectedVersion: number }, input: Input): Promise<ActionResult> {
  if (!isId(bound?.shiftId) || !isVersion(bound.expectedVersion) || !isKey(input?.idempotencyKey)) return { ok: false, code: "validation" };
  if (!isId(input.reason)) return { ok: false, code: "validation", fields: { reason: "required" } };
  const a = await api("shifts");
  if (!a.ok) return a.result;
  return toActionResult(await a.care.assignReplacement({ shiftId: bound.shiftId, expectedVersion: bound.expectedVersion, replacementResourceId: input.reason, idempotencyKey: input.idempotencyKey }));
}

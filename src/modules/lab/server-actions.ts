"use server";

import { toActionResult, type ActionResult } from "@/modules/admin/action-result";
import { authorizeAreaAction, isId, isKey, isVersion } from "@/modules/admin/action-guard";
import { toLabActor } from "@/modules/admin/workspace";
import { getLabApi } from "./index";
import { decideLabRoute, labPath, type LabRoute } from "./routes";
import { LAB_FAILURE_REASONS, rupeesToPaise } from "./rules";
import type { LabCollectionAction, LabFailureReason } from "./types";

/**
 * Lab server actions. Each one re-authorizes the route for the caller's
 * selected workspace, re-validates every argument (bound arguments are not
 * trusted), then calls the typed lab API, which authorizes again.
 */

type Input = { idempotencyKey: string; reason?: string };

const COLLECTION_ACTIONS: readonly LabCollectionAction[] = [
  "start_collection",
  "mark_collected",
  "record_handoff",
  "record_collection_failed",
  "record_handoff_failed",
];

async function api(route: LabRoute) {
  const auth = await authorizeAreaAction("lab", (s, key) => decideLabRoute(s, route, "en", labPath("en", route), key));
  if (!auth.ok) return auth;
  return { ok: true as const, lab: getLabApi({ actor: toLabActor(auth.ctx.workspace) }) };
}

export async function labCollectionAction(
  bound: { orderId: string; action: LabCollectionAction; expectedVersion: number; branchId: string },
  input: Input,
): Promise<ActionResult> {
  if (!isId(bound?.orderId) || !COLLECTION_ACTIONS.includes(bound.action) || !isVersion(bound.expectedVersion) || !isId(bound.branchId) || !isKey(input?.idempotencyKey)) {
    return { ok: false, code: "validation" };
  }
  const needsReason = bound.action === "record_collection_failed" || bound.action === "record_handoff_failed";
  const reason = input.reason;
  if (needsReason && !(LAB_FAILURE_REASONS as readonly string[]).includes(reason ?? "")) return { ok: false, code: "validation", fields: { reason: "required" } };
  const a = await api("collections");
  if (!a.ok) return a.result;
  return toActionResult(
    await a.lab.performCollectionAction({
      orderId: bound.orderId,
      action: bound.action,
      expectedVersion: bound.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      ...(needsReason ? { reason: reason as LabFailureReason } : {}),
      ...(bound.action === "record_handoff" ? { branchId: bound.branchId } : {}),
    }),
  );
}

export async function labRecollectionAction(bound: { orderId: string }, input: Input): Promise<ActionResult> {
  if (!isId(bound?.orderId) || !isKey(input?.idempotencyKey)) return { ok: false, code: "validation" };
  const a = await api("orders");
  if (!a.ok) return a.result;
  const result = await a.lab.requestRecollection({ orderId: bound.orderId, idempotencyKey: input.idempotencyKey });
  return result.ok ? { ok: true, reference: result.data.newOrderReference } : toActionResult(result);
}

export async function labReportAction(
  bound: { reportId: string; expectedVersion: number; step: "review" | "release" },
  input: Input,
): Promise<ActionResult> {
  if (!isId(bound?.reportId) || !isVersion(bound.expectedVersion) || (bound.step !== "review" && bound.step !== "release") || !isKey(input?.idempotencyKey)) {
    return { ok: false, code: "validation" };
  }
  const a = await api("reports");
  if (!a.ok) return a.result;
  const args = { reportId: bound.reportId, expectedVersion: bound.expectedVersion, idempotencyKey: input.idempotencyKey };
  return toActionResult(bound.step === "review" ? await a.lab.reviewReport(args) : await a.lab.releaseReport(args));
}

export async function labBranchAction(bound: { branchId: string; active: boolean; expectedVersion: number }, input: Input): Promise<ActionResult> {
  if (!isId(bound?.branchId) || typeof bound.active !== "boolean" || !isVersion(bound.expectedVersion) || !isKey(input?.idempotencyKey)) {
    return { ok: false, code: "validation" };
  }
  const a = await api("branches");
  if (!a.ok) return a.result;
  return toActionResult(await a.lab.setBranchActive({ ...bound, idempotencyKey: input.idempotencyKey }));
}

export async function labCatalogAction(
  bound: { itemId: string; expectedVersion: number },
  form: { price: string; preparation: string; active: boolean; idempotencyKey: string },
): Promise<ActionResult> {
  if (!isId(bound?.itemId) || !isVersion(bound.expectedVersion) || !isKey(form?.idempotencyKey)) return { ok: false, code: "validation" };
  const pricePaise = typeof form.price === "string" ? rupeesToPaise(form.price) : null;
  const fields: Record<string, string> = {};
  if (pricePaise === null) fields.price = "invalid";
  if (typeof form.preparation !== "string" || form.preparation.trim() === "" || form.preparation.length > 500) fields.preparation = "invalid";
  if (typeof form.active !== "boolean") fields.active = "invalid";
  if (Object.keys(fields).length > 0 || pricePaise === null) return { ok: false, code: "validation", fields };
  const a = await api("catalog");
  if (!a.ok) return a.result;
  return toActionResult(
    await a.lab.updateCatalogItem({
      itemId: bound.itemId,
      expectedVersion: bound.expectedVersion,
      idempotencyKey: form.idempotencyKey,
      pricePaise,
      preparation: form.preparation,
      active: form.active,
    }),
  );
}

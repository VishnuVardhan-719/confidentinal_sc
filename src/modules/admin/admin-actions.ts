"use server";

import { cookies } from "next/headers";
import { getContentApi } from "@/modules/content";
import type { Locale } from "@/modules/content/schema";
import type { ContentAction } from "@/modules/content/types";
import { isId, isKey, isVersion } from "./action-guard";
import { toActionResult, type ActionResult } from "./action-result";
import type { AdminCapability } from "./capabilities";
import { ADMIN_CAPABILITIES } from "./capabilities";
import { getAdminApi } from "./index";
import { decideAdminRoute, type AdminRoute } from "./routes";
import { normalizeBookingReference } from "./rules";
import { BOOKING_LOOKUP_COOKIE, authorizeOperationsSession } from "./session";

/**
 * Admin and CMS server actions. Each re-checks the route capability for the
 * server-asserted principal (never anything the browser sends), validates the
 * input, then calls the typed API, which checks the capability again.
 */

const SUSPEND_REASONS = ["left_organization", "security_concern", "role_change"] as const;
const LOCALES: readonly Locale[] = ["en", "te", "hi"];
const CMS_ACTIONS: readonly ContentAction[] = ["submit_preview", "return_to_draft", "publish", "archive"];

async function principalFor(route: AdminRoute) {
  const { admin } = await authorizeOperationsSession("admin");
  const access = decideAdminRoute(admin, route, "en", `/en/admin/${route}`);
  if (access.kind === "unauthenticated") return { ok: false as const, result: { ok: false, code: "unauthenticated" } as ActionResult };
  if (access.kind !== "allowed") return { ok: false as const, result: { ok: false, code: "forbidden" } as ActionResult };
  return { ok: true as const, principal: access.principal };
}

/**
 * Booking lookup without putting the reference in the URL: the validated
 * reference is kept in a short-lived httpOnly cookie that the page reads.
 */
export async function bookingLookupAction(raw: unknown): Promise<ActionResult> {
  const reference = typeof raw === "string" ? normalizeBookingReference(raw) : null;
  if (reference === null) return { ok: false, code: "validation", fields: { reference: "format" } };
  const p = await principalFor("bookings");
  if (!p.ok) return p.result;
  (await cookies()).set(BOOKING_LOOKUP_COOKIE, reference, { httpOnly: true, sameSite: "strict", secure: true, path: "/", maxAge: 300 });
  return { ok: true };
}

export async function suspendAdminAction(bound: { profileId: string }, input: { idempotencyKey: string; reason?: string }): Promise<ActionResult> {
  if (!isId(bound?.profileId) || !isKey(input?.idempotencyKey)) return { ok: false, code: "validation" };
  if (!(SUSPEND_REASONS as readonly string[]).includes(input.reason ?? "")) return { ok: false, code: "validation", fields: { reason: "required" } };
  const p = await principalFor("users");
  if (!p.ok) return p.result;
  return toActionResult(await getAdminApi({ principal: p.principal }).suspendAdmin({ profileId: bound.profileId, reason: input.reason as string, idempotencyKey: input.idempotencyKey }));
}

export async function inviteAdminAction(form: { email: string; capability: string; idempotencyKey: string }): Promise<ActionResult> {
  if (!isKey(form?.idempotencyKey)) return { ok: false, code: "validation" };
  const fields: Record<string, string> = {};
  if (typeof form.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) || form.email.length > 254) fields.email = "invalid";
  if (!(ADMIN_CAPABILITIES as readonly string[]).includes(form.capability)) fields.capability = "required";
  if (Object.keys(fields).length) return { ok: false, code: "validation", fields };
  const p = await principalFor("users");
  if (!p.ok) return p.result;
  return toActionResult(
    await getAdminApi({ principal: p.principal }).inviteAdmin({
      email: form.email,
      capabilities: [form.capability as AdminCapability],
      scope: { kind: "global" },
      idempotencyKey: form.idempotencyKey,
    }),
  );
}

export async function cmsSaveDraftAction(
  bound: { entryId: string | null; expectedVersion: number | null },
  form: { draft: unknown; idempotencyKey: string },
): Promise<ActionResult & { entryId?: string }> {
  if ((bound?.entryId !== null && !isId(bound?.entryId)) || (bound.expectedVersion !== null && !isVersion(bound.expectedVersion)) || !isKey(form?.idempotencyKey)) {
    return { ok: false, code: "validation" };
  }
  const p = await principalFor("cms");
  if (!p.ok) return p.result;
  // The content API validates the draft with the strict schema (no HTML, no extra fields).
  const result = await getContentApi({ principal: p.principal }).saveDraft({ entryId: bound.entryId, draft: form.draft, expectedVersion: bound.expectedVersion, idempotencyKey: form.idempotencyKey });
  return result.ok ? { ok: true, entryId: result.data.id } : toActionResult(result);
}

export async function cmsTransitionAction(
  bound: { entryId: string; locale: Locale; action: ContentAction; expectedVersion: number },
  input: { idempotencyKey: string },
): Promise<ActionResult> {
  if (!isId(bound?.entryId) || !LOCALES.includes(bound.locale) || !CMS_ACTIONS.includes(bound.action) || !isVersion(bound.expectedVersion) || !isKey(input?.idempotencyKey)) {
    return { ok: false, code: "validation" };
  }
  const p = await principalFor("cms");
  if (!p.ok) return p.result;
  return toActionResult(await getContentApi({ principal: p.principal }).transition({ ...bound, idempotencyKey: input.idempotencyKey }));
}

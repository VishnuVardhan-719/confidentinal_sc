import { fail, ok } from "@/lib/api/result";
import { isEnabled } from "@/lib/feature-flags";
import { getAuditApi } from "@/modules/audit";
import type { AuditFilter } from "@/modules/audit/types";
import { canReadAudit } from "@/modules/audit/rules";
import { metricFrom, toLoaderResult, type AdminLoaderContext, type AppLocale, type LoaderResult } from "./access";
import { can, type AdminCapability } from "./capabilities";
import { getAdminApi } from "./index";
import { adminPath, type AdminRoute } from "./routes";
import { normalizeBookingReference } from "./rules";
import {
  toAdminDashboard,
  toAdminUserRow,
  toAuditRow,
  toBookingOps,
  toGateRows,
  toInviteRow,
  toPaymentRow,
  toRefundRow,
  toSupportRow,
  type AdminDashboardVM,
  type AdminQueueVM,
  type AdminUserRowVM,
  type AuditRowVM,
  type BookingOpsVM,
  type GateRowVM,
  type InviteRowVM,
  type PaymentRowVM,
  type RefundRowVM,
  type SupportRowVM,
} from "./view-models";

/** Server-side route loaders for the admin area. The route guard has already checked the capability. */

const clock = (ctx: AdminLoaderContext) => (ctx.now ? ctx.now() : new Date());
const api = (ctx: AdminLoaderContext) => getAdminApi({ env: ctx.env, principal: ctx.principal, now: ctx.now });

/** Real queue counts only, for capabilities the principal holds. No invented totals. */
export async function loadAdminDashboard(ctx: AdminLoaderContext, locale: AppLocale): Promise<LoaderResult<AdminDashboardVM>> {
  const admin = api(ctx);
  const now = clock(ctx);
  const has = (c: AdminCapability) => can(ctx.principal, c, { now });
  const href = (r: AdminRoute) => adminPath(locale, r);
  const tasks: Promise<AdminQueueVM | null>[] = [
    has("provider:verify")
      ? admin.listProviderReviews({ state: "submitted" }).then((r) => ({ key: "providerReviews" as const, labelKey: "admin.dashboard.providerReviews", metric: metricFrom(r), href: href("providers") }))
      : Promise.resolve(null),
    has("coverage:verify")
      ? admin.listCoverage({ status: "proposed" }).then((r) => ({ key: "coverageProposals" as const, labelKey: "admin.dashboard.coverageProposals", metric: metricFrom(r), href: href("coverage") }))
      : Promise.resolve(null),
    has("booking:operate")
      ? admin.listBookingExceptions().then((r) => ({ key: "bookingExceptions" as const, labelKey: "admin.dashboard.bookingExceptions", metric: metricFrom(r), href: href("bookings") }))
      : Promise.resolve(null),
    has("support:operate")
      ? admin.listSupportQueue().then((r) => ({
          key: "supportEscalations" as const,
          labelKey: "admin.dashboard.supportEscalations",
          metric: metricFrom(r, (items) => items.filter((t) => t.status === "escalated").length),
          href: href("support"),
        }))
      : Promise.resolve(null),
    has("payment:read")
      ? admin.listRefunds().then((r) => ({
          key: "refundRequests" as const,
          labelKey: "admin.dashboard.refundRequests",
          metric: metricFrom(r, (items) => items.filter((x) => x.status === "requested").length),
          href: href("payments"),
        }))
      : Promise.resolve(null),
    canReadAudit(ctx.principal, now)
      ? getAuditApi({ env: ctx.env, principal: ctx.principal, now: ctx.now })
          .listEvents({ outcome: "denied", from: new Date(now.getTime() - 86_400_000).toISOString() })
          .then((r) => ({ key: "deniedAuditEvents" as const, labelKey: "admin.dashboard.deniedAuditEvents", metric: metricFrom(r), href: href("audit") }))
      : Promise.resolve(null),
  ];
  const queues = (await Promise.all(tasks)).filter((q): q is AdminQueueVM => q !== null);
  return toLoaderResult(ok(toAdminDashboard(queues)), admin.mode, (vm) => vm.queues.length === 0);
}

/** Booking operations search. Invalid references are rejected before any call; no free-text search. */
export async function loadBookingByReference(ctx: AdminLoaderContext, rawReference: string): Promise<LoaderResult<BookingOpsVM>> {
  const admin = api(ctx);
  const reference = normalizeBookingReference(rawReference);
  if (reference === null) return toLoaderResult(fail("validation", { fields: { reference: "format" } }), admin.mode);
  const result = await admin.findBookingByReference(reference);
  return toLoaderResult(result.ok ? ok(toBookingOps(result.data)) : result, admin.mode);
}

export async function loadBookingExceptions(ctx: AdminLoaderContext): Promise<LoaderResult<BookingOpsVM[]>> {
  const admin = api(ctx);
  const result = await admin.listBookingExceptions();
  return toLoaderResult(result.ok ? ok(result.data.items.map(toBookingOps)) : result, admin.mode, (rows) => rows.length === 0);
}

export async function loadAdminUsers(ctx: AdminLoaderContext): Promise<LoaderResult<{ users: AdminUserRowVM[]; invites: InviteRowVM[] | null }>> {
  const admin = api(ctx);
  const now = clock(ctx);
  const [users, invites] = await Promise.all([admin.listAdmins(), admin.listAdminInvites()]);
  if (!users.ok) return toLoaderResult(users, admin.mode);
  const canManage = can(ctx.principal, "membership:admin", { now });
  return toLoaderResult(
    ok({
      users: users.data.map((u) => toAdminUserRow(u, ctx.principal.profileId, canManage)),
      invites: invites.ok ? invites.data.map(toInviteRow) : null,
    }),
    admin.mode,
    (d) => d.users.length === 0 && (d.invites === null || d.invites.length === 0),
  );
}

export type PaymentsVM = {
  payments: PaymentRowVM[];
  refunds: RefundRowVM[] | null;
  /** Live gateway flag (display only). Refund approval stays gated: no approved contract or live merchant. */
  liveGatewayEnabled: boolean;
  refundApproval: "gated";
};

export async function loadPayments(ctx: AdminLoaderContext): Promise<LoaderResult<PaymentsVM>> {
  const admin = api(ctx);
  const [payments, refunds] = await Promise.all([admin.listPayments(), admin.listRefunds()]);
  if (!payments.ok) return toLoaderResult(payments, admin.mode);
  return toLoaderResult(
    ok({
      payments: payments.data.items.map(toPaymentRow),
      refunds: refunds.ok ? refunds.data.items.map(toRefundRow) : null,
      liveGatewayEnabled: isEnabled("livePayments", ctx.env ?? process.env),
      refundApproval: "gated" as const,
    }),
    admin.mode,
    (d) => d.payments.length === 0 && (d.refunds === null || d.refunds.length === 0),
  );
}

export async function loadSupportQueue(ctx: AdminLoaderContext): Promise<LoaderResult<SupportRowVM[]>> {
  const admin = api(ctx);
  const result = await admin.listSupportQueue();
  return toLoaderResult(result.ok ? ok(result.data.items.map(toSupportRow)) : result, admin.mode, (rows) => rows.length === 0);
}

export async function loadAudit(ctx: AdminLoaderContext, filter: AuditFilter = {}): Promise<LoaderResult<{ rows: AuditRowVM[]; nextCursor: string | null }>> {
  const audit = getAuditApi({ env: ctx.env, principal: ctx.principal, now: ctx.now });
  const result = await audit.listEvents(filter);
  return toLoaderResult(
    result.ok ? ok({ rows: result.data.items.map(toAuditRow), nextCursor: result.data.nextCursor }) : result,
    audit.mode,
    (d) => d.rows.length === 0,
  );
}

export async function loadSettings(ctx: AdminLoaderContext): Promise<LoaderResult<GateRowVM[]>> {
  const admin = api(ctx);
  const result = await admin.getSettings();
  return toLoaderResult(result.ok ? ok(toGateRows(result.data)) : result, admin.mode);
}

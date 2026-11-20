import { useLocale, useTranslations } from "next-intl";
import { CursorPager } from "@/components/admin/ops/cursor-pager";
import { formatDateTime, formatPaiseOrDash } from "@/components/admin/ops/format";
import { MetricTile } from "@/components/admin/ops/metric-tile";
import { OpsAction } from "@/components/admin/ops/ops-action";
import { OpsStatus, useKeyTranslator } from "@/components/admin/ops/ops-status";
import { DetailGrid, RecordList } from "@/components/admin/ops/record-list";
import { LoaderState } from "@/components/admin/ops/states";
import { GateNotice } from "@/components/shared/gate-notice";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import type { AppLocale } from "@/i18n/routing";
import type { LoaderResult } from "@/modules/admin/access";
import { bookingLookupAction, inviteAdminAction, suspendAdminAction } from "@/modules/admin/admin-actions";
import { ADMIN_CAPABILITIES } from "@/modules/admin/capabilities";
import type { PaymentsVM } from "@/modules/admin/loaders";
import {
  capabilityLabelKey,
  type AdminDashboardVM,
  type AdminUserRowVM,
  type AuditRowVM,
  type BookingOpsVM,
  type GateRowVM,
  type InviteRowVM,
  type SupportRowVM,
} from "@/modules/admin/view-models";
import { BookingSearchForm, InviteAdminForm } from "./admin-forms";

const useAppLocale = () => useLocale() as AppLocale;

export function AdminDashboardView({ result }: { result: LoaderResult<AdminDashboardVM> }) {
  const t = useTranslations("admin.dashboard");
  const tk = useKeyTranslator();
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <LoaderState result={result} empty={{ title: t("noAreasTitle"), description: t("noAreasBody") }}>
        {(vm) => (
          <div className="grid gap-6">
            {vm.allClear ? <Notice tone="info">{t("allClear")}</Notice> : null}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {vm.queues.map((q) => (
                <MetricTile key={q.key} label={tk(q.labelKey)} metric={q.metric} href={q.href.replace(/^\/(en|te|hi)/, "")} testId={`queue-${q.key}`} />
              ))}
            </div>
          </div>
        )}
      </LoaderState>
    </div>
  );
}

export function BookingOpsView({ lookup, exceptions }: { lookup: LoaderResult<BookingOpsVM> | null; exceptions: LoaderResult<BookingOpsVM[]> }) {
  const t = useTranslations("admin.bookings");
  const tk = useKeyTranslator();
  const locale = useAppLocale();
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <BookingSearchForm run={bookingLookupAction} labels={{ label: t("searchLabel"), hint: t("searchHint"), search: t("search"), invalid: t("invalid") }} />
      {lookup ? (
        <LoaderState result={lookup} empty={{ title: t("search") }}>
          {(b) => (
            <section aria-labelledby="booking-result" className="grid gap-4 rounded-lg border border-border bg-surface p-5">
              <h2 id="booking-result" className="text-xl font-semibold text-ink">
                {t("resultTitle", { reference: b.reference })}
              </h2>
              <DetailGrid
                items={[
                  { label: t("fields.category"), value: tk(b.categoryKey) },
                  { label: t("fields.provider"), value: b.providerDisplayName },
                  { label: t("fields.booking"), value: <span data-testid="booking-status">{b.bookingState}</span> },
                  { label: t("fields.payment"), value: <span data-testid="payment-status"><OpsStatus status={b.payment} /></span> },
                  { label: t("fields.created"), value: formatDateTime(b.createdAt, locale) },
                  { label: t("fields.scheduled"), value: formatDateTime(b.scheduledStart, locale) },
                ]}
              />
            </section>
          )}
        </LoaderState>
      ) : null}
      <section aria-labelledby="booking-exceptions" className="grid gap-4">
        <h2 id="booking-exceptions" className="text-xl font-semibold text-ink">
          {t("exceptionsTitle")}
        </h2>
        <LoaderState result={exceptions} empty={{ title: t("exceptionsEmptyTitle"), description: t("exceptionsEmptyBody") }}>
          {(rows) => (
            <RecordList
              label={t("exceptionsTitle")}
              rows={rows.flatMap((b) => b.exceptions.filter((e) => e.open).map((e) => ({ b, e })))}
              rowKey={(r) => `${r.b.reference}-${r.e.codeKey}-${r.e.raisedAt}`}
              columns={[
                { key: "reference", header: t("columns.reference"), primary: true, cell: (r) => r.b.reference },
                { key: "category", header: t("columns.category"), cell: (r) => tk(r.b.categoryKey) },
                { key: "provider", header: t("columns.provider"), cell: (r) => r.b.providerDisplayName },
                { key: "exception", header: t("columns.exception"), cell: (r) => tk(r.e.codeKey) },
                { key: "raised", header: t("columns.raised"), cell: (r) => formatDateTime(r.e.raisedAt, locale) },
              ]}
            />
          )}
        </LoaderState>
      </section>
    </div>
  );
}

export function AdminUsersView({ result }: { result: LoaderResult<{ users: AdminUserRowVM[]; invites: InviteRowVM[] | null }> }) {
  const t = useTranslations("admin.users");
  const tk = useKeyTranslator();
  const locale = useAppLocale();
  const reasons = (["left_organization", "security_concern", "role_change"] as const).map((r) => ({ value: r, label: t(`suspendReasons.${r}`) }));
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <LoaderState result={result} empty={{ title: t("emptyTitle"), description: t("emptyBody") }}>
        {(d) => (
          <div className="grid gap-10">
            <RecordList
              label={t("title")}
              rows={d.users}
              rowKey={(u) => u.profileId}
              columns={[
                { key: "name", header: t("columns.name"), primary: true, cell: (u) => u.displayName },
                { key: "status", header: t("columns.status"), cell: (u) => <OpsStatus status={u.status} /> },
                { key: "mfa", header: t("columns.mfa"), cell: (u) => (u.mfaEnrolled ? t("mfaOn") : t("mfaOff")) },
                { key: "grants", header: t("columns.grants"), cell: (u) => u.grants.map((g) => tk(g.labelKey)).join(", ") },
                {
                  key: "actions",
                  header: t("columns.actions"),
                  cell: (u) =>
                    !u.manageable ? (
                      <span className="text-sm text-muted">{t("self")}</span>
                    ) : u.status.labelKey === "admin.status.admin.active" ? (
                      <OpsAction
                        variant="secondary"
                        tone="danger"
                        run={suspendAdminAction.bind(null, { profileId: u.profileId })}
                        labels={{
                          label: t("suspend"),
                          done: t("done"),
                          confirm: { title: t("suspendTitle", { name: u.displayName }), description: t("suspendBody"), confirmLabel: t("suspend") },
                          reason: { label: t("reasonLabel"), placeholder: t("reasonPlaceholder"), required: t("reasonRequired"), options: reasons },
                        }}
                      />
                    ) : null,
                },
              ]}
            />
            <section aria-labelledby="admin-invites" className="grid gap-4">
              <h2 id="admin-invites" className="text-xl font-semibold text-ink">
                {t("invitesTitle")}
              </h2>
              {d.invites === null ? (
                <Notice tone="warning">{t("invitesUnavailable")}</Notice>
              ) : (
                <RecordList
                  label={t("invitesTitle")}
                  rows={d.invites}
                  rowKey={(i) => i.id}
                  columns={[
                    { key: "email", header: t("inviteColumns.email"), primary: true, cell: (i) => i.maskedEmail },
                    { key: "access", header: t("inviteColumns.access"), cell: (i) => i.capabilityKeys.map((k) => tk(k)).join(", ") },
                    { key: "status", header: t("inviteColumns.status"), cell: (i) => <OpsStatus status={i.status} /> },
                    { key: "sent", header: t("inviteColumns.sent"), cell: (i) => formatDateTime(i.invitedAt, locale) },
                  ]}
                />
              )}
              <h3 className="text-lg font-semibold text-ink">{t("inviteTitle")}</h3>
              <InviteAdminForm
                run={inviteAdminAction}
                options={ADMIN_CAPABILITIES.map((c) => ({ value: c, label: tk(capabilityLabelKey(c)) }))}
                labels={{
                  title: t("inviteTitle"),
                  email: t("emailLabel"),
                  emailInvalid: t("emailInvalid"),
                  capability: t("capabilityLabel"),
                  capabilityRequired: t("capabilityRequired"),
                  placeholder: t("reasonPlaceholder"),
                  submit: t("invite"),
                  done: t("invited"),
                }}
              />
            </section>
          </div>
        )}
      </LoaderState>
    </div>
  );
}

export function PaymentsView({ result }: { result: LoaderResult<PaymentsVM> }) {
  const t = useTranslations("admin.payments");
  const tk = useKeyTranslator();
  const locale = useAppLocale();
  const money = (p: number) => <span className="tabular">{formatPaiseOrDash(p)}</span>;
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <LoaderState result={result} empty={{ title: t("emptyTitle"), description: t("emptyBody") }}>
        {(d) => (
          <div className="grid gap-8">
            {d.liveGatewayEnabled ? null : <GateNotice feature="livePayments">{t("liveOff")}</GateNotice>}
            <RecordList
              label={t("title")}
              rows={d.payments}
              rowKey={(p) => p.bookingReference}
              columns={[
                { key: "reference", header: t("columns.reference"), primary: true, cell: (p) => p.bookingReference },
                { key: "status", header: t("columns.status"), cell: (p) => <OpsStatus status={p.status} /> },
                { key: "due", header: t("columns.due"), cell: (p) => money(p.amountDuePaise) },
                { key: "collected", header: t("columns.collected"), cell: (p) => money(p.collectedPaise) },
                {
                  key: "outstanding",
                  header: t("columns.outstanding"),
                  cell: (p) => (p.reconciliationMismatch ? <span className="font-semibold text-danger">{t("mismatch")}</span> : money(p.outstandingPaise)),
                },
                {
                  key: "method",
                  header: t("columns.method"),
                  cell: (p) => (
                    <span>
                      {p.methodKey ? tk(p.methodKey) : t("noMethod")}
                      {p.testMode ? <StatusBadge tone="warning" label={t("testMode")} className="ml-2" /> : null}
                    </span>
                  ),
                },
                { key: "reconciliation", header: t("columns.reconciliation"), cell: (p) => tk(p.reconciliationKey) },
              ]}
            />
            <section aria-labelledby="refunds" className="grid gap-4">
              <h2 id="refunds" className="text-xl font-semibold text-ink">
                {t("refundsTitle")}
              </h2>
              <Notice tone="neutral" icon="lock">
                {t("refundGated")}
              </Notice>
              {d.refunds === null ? (
                <Notice tone="warning">{t("refundsUnavailable")}</Notice>
              ) : (
                <RecordList
                  label={t("refundsTitle")}
                  rows={d.refunds}
                  rowKey={(r) => r.id}
                  columns={[
                    { key: "reference", header: t("refundColumns.reference"), primary: true, cell: (r) => r.bookingReference },
                    { key: "status", header: t("refundColumns.status"), cell: (r) => <OpsStatus status={r.status} /> },
                    { key: "requested", header: t("refundColumns.requested"), cell: (r) => money(r.requestedPaise) },
                    { key: "approved", header: t("refundColumns.approved"), cell: (r) => (r.approvedPaise === null ? t("notApproved") : money(r.approvedPaise)) },
                    { key: "policy", header: t("refundColumns.policy"), cell: (r) => r.policyVersion },
                    { key: "date", header: t("refundColumns.date"), cell: (r) => formatDateTime(r.requestedAt, locale) },
                  ]}
                />
              )}
            </section>
          </div>
        )}
      </LoaderState>
    </div>
  );
}

export function SupportQueueView({ result }: { result: LoaderResult<SupportRowVM[]> }) {
  const t = useTranslations("admin.support");
  const tk = useKeyTranslator();
  const locale = useAppLocale();
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <LoaderState result={result} empty={{ title: t("emptyTitle"), description: t("emptyBody") }}>
        {(rows) => (
          <RecordList
            label={t("title")}
            rows={rows}
            rowKey={(r) => r.id}
            columns={[
              { key: "reference", header: t("columns.reference"), primary: true, cell: (r) => r.reference },
              { key: "priority", header: t("columns.priority"), cell: (r) => <OpsStatus status={r.priority} /> },
              { key: "status", header: t("columns.status"), cell: (r) => <OpsStatus status={r.status} /> },
              { key: "owner", header: t("columns.owner"), cell: (r) => (r.ownerName ? `${tk(r.ownerKey)}: ${r.ownerName}` : tk(r.ownerKey)) },
              { key: "booking", header: t("columns.booking"), cell: (r) => r.bookingReference ?? t("none") },
              { key: "opened", header: t("columns.opened"), cell: (r) => formatDateTime(r.createdAt, locale) },
              { key: "last", header: t("columns.lastResponse"), cell: (r) => formatDateTime(r.lastResponseAt, locale) },
            ]}
          />
        )}
      </LoaderState>
    </div>
  );
}

export const AUDIT_CATEGORIES = ["verification", "coverage", "booking", "membership", "content", "payment", "support", "security", "settings"] as const;
export const AUDIT_OUTCOMES = ["success", "denied", "conflict"] as const;

export function AuditView({
  result,
  category,
  outcome,
  cursor,
}: {
  result: LoaderResult<{ rows: AuditRowVM[]; nextCursor: string | null }>;
  category?: string;
  outcome?: string;
  cursor?: string;
}) {
  const t = useTranslations("admin.audit");
  const tk = useKeyTranslator();
  const locale = useAppLocale();
  const selectClass = "min-h-target rounded-md border border-border-strong bg-surface px-3 text-base text-ink";
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <form method="get" aria-label={t("filtersLabel")} className="flex flex-wrap items-end gap-4">
        <label className="grid gap-1 text-base font-semibold text-ink">
          {t("categoryLabel")}
          <select name="category" defaultValue={category ?? ""} className={selectClass}>
            <option value="">{t("all")}</option>
            {AUDIT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`category.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-base font-semibold text-ink">
          {t("outcomeLabel")}
          <select name="outcome" defaultValue={outcome ?? ""} className={selectClass}>
            <option value="">{t("all")}</option>
            {AUDIT_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {t(`outcome.${o}`)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="min-h-target rounded-md border border-forest bg-surface px-5 text-base text-forest hover:bg-mist">
          {t("apply")}
        </button>
      </form>
      <LoaderState result={result} empty={{ title: t("emptyTitle"), description: t("emptyBody") }}>
        {(d) => (
          <>
            <RecordList
              label={t("title")}
              rows={d.rows}
              rowKey={(r) => r.id}
              columns={[
                { key: "time", header: t("columns.time"), primary: true, cell: (r) => formatDateTime(r.occurredAt, locale) },
                { key: "actor", header: t("columns.actor"), cell: (r) => tk(r.actorKindKey) },
                { key: "action", header: t("columns.action"), cell: (r) => <code className="text-sm">{r.action}</code> },
                { key: "category", header: t("columns.category"), cell: (r) => <OpsStatus status={r.category} /> },
                { key: "target", header: t("columns.target"), cell: (r) => <code className="text-sm">{r.target}</code> },
                { key: "outcome", header: t("columns.outcome"), cell: (r) => <OpsStatus status={r.outcome} /> },
                { key: "reason", header: t("columns.reason"), cell: (r) => r.reason ?? r.reasonCode ?? "—" },
              ]}
            />
            <CursorPager pathname="/admin/audit" query={{ category, outcome }} nextCursor={d.nextCursor} cursor={cursor} />
          </>
        )}
      </LoaderState>
    </div>
  );
}

export function SettingsView({ result }: { result: LoaderResult<GateRowVM[]> }) {
  const t = useTranslations("admin.settings");
  const tk = useKeyTranslator();
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <LoaderState result={result} empty={{ title: t("title") }}>
        {(rows) => (
          <RecordList
            label={t("title")}
            rows={rows}
            rowKey={(r) => r.flag}
            columns={[
              { key: "gate", header: t("columns.gate"), primary: true, cell: (r) => tk(r.labelKey) },
              { key: "state", header: t("columns.state"), cell: (r) => <OpsStatus status={r.state} /> },
            ]}
          />
        )}
      </LoaderState>
    </div>
  );
}

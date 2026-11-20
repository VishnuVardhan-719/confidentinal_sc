import { useLocale, useTranslations } from "next-intl";
import { formatDateTime, formatPaiseOrDash, formatWindow } from "@/components/admin/ops/format";
import { MetricTile } from "@/components/admin/ops/metric-tile";
import { OpsAction } from "@/components/admin/ops/ops-action";
import { OpsStatus, useKeyTranslator } from "@/components/admin/ops/ops-status";
import { RecordList } from "@/components/admin/ops/record-list";
import { LoaderState, NotConnected } from "@/components/admin/ops/states";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import type { LoaderResult } from "@/modules/admin/access";
import type { CaregiverOption, ShiftGroup } from "@/modules/caretaker/loaders";
import { CARE_DECLINE_REASONS, CARE_INTERRUPT_REASONS } from "@/modules/caretaker/rules";
import { careAcceptAction, careAssignmentAction, careDeclineAction, careReplaceAction, careShiftAction } from "@/modules/caretaker/server-actions";
import type { AbsenceReason } from "@/modules/caretaker/types";
import type {
  AssignmentRowVM,
  CaregiverRowVM,
  CareRequestRowVM,
  CaretakerDashboardVM,
  ServiceRowVM,
  ShiftRowVM,
} from "@/modules/caretaker/view-models";

const useAppLocale = () => useLocale() as AppLocale;
const ABSENCE: readonly AbsenceReason[] = ["caregiver_unwell", "caregiver_emergency", "transport_issue", "other"];

function ScopeNote() {
  const t = useTranslations("caretaker");
  return <Notice tone="info">{t("scopeNote")}</Notice>;
}

export function CareDashboardView({ result, workspaceName }: { result: LoaderResult<CaretakerDashboardVM>; workspaceName: string }) {
  const t = useTranslations("caretaker.dashboard");
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description", { name: workspaceName })} />
      <ScopeNote />
      <LoaderState result={result} empty={{ title: t("title") }}>
        {(vm) => (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {vm.pendingRequests ? <MetricTile label={t("metrics.pendingRequests")} metric={vm.pendingRequests} href="/caretaker/requests" testId="metric-pending" /> : null}
            <MetricTile label={t("metrics.todayAssignments")} metric={vm.todayAssignments} href="/caretaker/assignments" testId="metric-today" />
            <MetricTile label={t("metrics.activeCare")} metric={vm.activeCare} href="/caretaker/assignments" testId="metric-active" />
          </div>
        )}
      </LoaderState>
    </div>
  );
}

export function CareServicesView({ result }: { result: LoaderResult<ServiceRowVM[]> }) {
  const t = useTranslations("caretaker.services");
  const tk = useKeyTranslator();
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <ScopeNote />
      <LoaderState result={result} empty={{ title: t("emptyTitle"), description: t("emptyBody") }}>
        {(rows) => (
          <RecordList
            label={t("title")}
            rows={rows}
            rowKey={(r) => r.id}
            columns={[
              { key: "title", header: t("columns.title"), primary: true, cell: (r) => r.title },
              { key: "tasks", header: t("columns.tasks"), cell: (r) => r.tasks.map((s) => tk(s.labelKey)).join(", ") },
              {
                key: "rates",
                header: t("columns.rates"),
                cell: (r) => (
                  <ul className="grid gap-1">
                    {r.rates.map((rate) => (
                      <li key={rate.period.labelKey} className="tabular">
                        {formatPaiseOrDash(rate.amountPaise)} {tk(rate.period.labelKey)}
                        {rate.periodSupportedByBackend ? null : <span className="ml-2 text-sm text-warning-text">({t("periodPending")})</span>}
                      </li>
                    ))}
                  </ul>
                ),
              },
              { key: "coverage", header: t("columns.coverage"), cell: (r) => r.coveragePins.join(", ") },
              { key: "status", header: t("columns.status"), cell: (r) => (r.active ? t("offered") : t("notOffered")) },
            ]}
          />
        )}
      </LoaderState>
    </div>
  );
}

export function CareStaffView({ result }: { result: LoaderResult<CaregiverRowVM[]> }) {
  const t = useTranslations("caretaker.staff");
  const tk = useKeyTranslator();
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <LoaderState result={result} empty={{ title: t("emptyTitle"), description: t("emptyBody") }}>
        {(rows) => (
          <RecordList
            label={t("title")}
            rows={rows}
            rowKey={(r) => r.resourceId}
            columns={[
              { key: "name", header: t("columns.name"), primary: true, cell: (r) => r.displayName },
              { key: "skills", header: t("columns.skills"), cell: (r) => r.skills.map((s) => tk(s.labelKey)).join(", ") },
              { key: "languages", header: t("columns.languages"), cell: (r) => r.languages.map((l) => tk(`common.locales.${l}`)).join(", ") },
              { key: "credential", header: t("columns.credential"), cell: (r) => <OpsStatus status={r.credential} /> },
              { key: "membership", header: t("columns.membership"), cell: (r) => tk(r.membershipKey) },
            ]}
          />
        )}
      </LoaderState>
    </div>
  );
}

export function CareRequestsView({ result }: { result: LoaderResult<{ rows: CareRequestRowVM[]; nextCursor: string | null; caregivers: CaregiverOption[] }> }) {
  const t = useTranslations("caretaker.requests");
  const td = useTranslations("caretaker.decline");
  const tk = useKeyTranslator();
  const locale = useAppLocale();
  const declineOptions = CARE_DECLINE_REASONS.map((r) => ({ value: r, label: td(r) }));
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <ScopeNote />
      <LoaderState result={result} empty={{ title: t("emptyTitle"), description: t("emptyBody") }}>
        {(d) => (
          <RecordList
            label={t("title")}
            rows={d.rows}
            rowKey={(r) => r.id}
            columns={[
              { key: "reference", header: t("columns.reference"), primary: true, cell: (r) => r.reference },
              { key: "tasks", header: t("columns.tasks"), cell: (r) => r.tasks.map((s) => tk(s.labelKey)).join(", ") },
              { key: "time", header: t("columns.time"), cell: (r) => formatWindow(r.start, r.end, locale) },
              {
                key: "rate",
                header: t("columns.rate"),
                cell: (r) => (
                  <span className="tabular">
                    {t("rateLine", {
                      amount: formatPaiseOrDash(r.rate.amountPaise),
                      period: tk(r.rate.period.labelKey),
                      units: r.rate.units,
                      total: formatPaiseOrDash(r.rate.totalPaise),
                    })}
                  </span>
                ),
              },
              { key: "pin", header: t("columns.pin"), cell: (r) => <span className="tabular">{r.servicePin}</span> },
              {
                key: "actions",
                header: t("columns.actions"),
                cell: (r) => {
                  if (!r.canDecide) return null;
                  const eligible = d.caregivers.filter((c) => c.skills === null || r.taskCodes.every((task) => c.skills?.includes(task)));
                  return (
                    <div className="grid gap-2">
                      {eligible.length ? (
                        <OpsAction
                          run={careAcceptAction.bind(null, { requestId: r.id, expectedVersion: r.version })}
                          labels={{
                            label: t("accept"),
                            done: t("accepted"),
                            confirm: { title: t("acceptTitle", { reference: r.reference }), description: t("acceptBody"), confirmLabel: t("confirmAccept") },
                            reason: { label: t("caregiverLabel"), placeholder: t("selectPlaceholder"), required: t("caregiverRequired"), options: eligible.map((c) => ({ value: c.resourceId, label: c.label })) },
                          }}
                        />
                      ) : (
                        <span className="text-sm text-warning-text">{t("noEligible")}</span>
                      )}
                      <OpsAction
                        variant="secondary"
                        tone="danger"
                        run={careDeclineAction.bind(null, { requestId: r.id, expectedVersion: r.version })}
                        labels={{
                          label: t("decline"),
                          done: t("declined"),
                          confirm: { title: t("declineTitle", { reference: r.reference }), description: t("declineBody"), confirmLabel: t("decline") },
                          reason: { label: t("reasonLabel"), placeholder: t("reasonPlaceholder"), required: t("reasonRequired"), options: declineOptions },
                        }}
                      />
                    </div>
                  );
                },
              },
            ]}
          />
        )}
      </LoaderState>
    </div>
  );
}

function AssignmentActions({ row }: { row: AssignmentRowVM }) {
  const t = useTranslations("caretaker.assignments");
  const ti = useTranslations("caretaker.interrupt");
  const tr = useTranslations("caretaker.requests");
  return (
    <div className="flex flex-wrap gap-2">
      {row.actions.map((action) => (
        <OpsAction
          key={action}
          variant={action === "interrupt" ? "secondary" : "primary"}
          tone={action === "interrupt" ? "danger" : "primary"}
          run={careAssignmentAction.bind(null, { assignmentId: row.id, action, expectedVersion: row.version })}
          labels={{
            label: t(`actions.${action}`),
            done: t("done"),
            confirm: {
              title: t("confirmTitle", { action: t(`actions.${action}`), reference: row.reference }),
              description: action === "interrupt" ? t("interruptBody") : t("confirmBody"),
              confirmLabel: t(`actions.${action}`),
            },
            ...(action === "interrupt"
              ? { reason: { label: tr("reasonLabel"), placeholder: tr("reasonPlaceholder"), required: tr("reasonRequired"), options: CARE_INTERRUPT_REASONS.map((r) => ({ value: r, label: ti(r) })) } }
              : {}),
          }}
        />
      ))}
    </div>
  );
}

export function CareAssignmentsView({ result }: { result: LoaderResult<AssignmentRowVM[]> }) {
  const t = useTranslations("caretaker.assignments");
  const tk = useKeyTranslator();
  const locale = useAppLocale();
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <ScopeNote />
      <LoaderState result={result} empty={{ title: t("emptyTitle"), description: t("emptyBody") }}>
        {(rows) => (
          <RecordList
            label={t("title")}
            rows={rows}
            rowKey={(r) => r.id}
            columns={[
              {
                key: "reference",
                header: t("columns.reference"),
                primary: true,
                cell: (r) => (
                  <Link href={`/caretaker/assignments/${encodeURIComponent(r.id)}`} className="font-semibold text-forest underline underline-offset-4">
                    {r.reference}
                  </Link>
                ),
              },
              { key: "caregiver", header: t("columns.caregiver"), cell: (r) => r.caregiverName },
              { key: "time", header: t("columns.time"), cell: (r) => formatWindow(r.start, r.end, locale) },
              { key: "tasks", header: t("columns.tasks"), cell: (r) => r.tasks.map((s) => tk(s.labelKey)).join(", ") },
              { key: "status", header: t("columns.status"), cell: (r) => <OpsStatus status={r.status} /> },
              { key: "actions", header: t("columns.actions"), cell: (r) => <AssignmentActions row={r} /> },
            ]}
          />
        )}
      </LoaderState>
    </div>
  );
}

function ShiftTable({ rows, replacements, label }: { rows: ShiftRowVM[]; replacements: { resourceId: string; label: string }[]; label: string }) {
  const t = useTranslations("caretaker.shifts");
  const ta = useTranslations("caretaker.absence");
  const tr = useTranslations("caretaker.requests");
  const tk = useKeyTranslator();
  const locale = useAppLocale();
  return (
    <RecordList
      label={label}
      rows={rows}
      rowKey={(r) => r.id}
      columns={[
        { key: "caregiver", header: t("columns.caregiver"), primary: true, cell: (r) => r.caregiverName },
        { key: "planned", header: t("columns.planned"), cell: (r) => formatWindow(r.plannedStart, r.plannedEnd, locale) },
        { key: "in", header: t("columns.checkIn"), cell: (r) => formatDateTime(r.checkInAt, locale) },
        { key: "out", header: t("columns.checkOut"), cell: (r) => formatDateTime(r.checkOutAt, locale) },
        {
          key: "attendance",
          header: t("columns.attendance"),
          cell: (r) => (
            <div className="grid gap-1">
              <OpsStatus status={r.attendance} />
              {r.absenceKey ? <span className="text-sm text-muted">{tk(r.absenceKey)}</span> : null}
              {r.replacementName ? <span className="text-sm text-muted">{t("replacedBy", { name: r.replacementName })}</span> : null}
            </div>
          ),
        },
        {
          key: "actions",
          header: t("columns.actions"),
          cell: (r) => (
            <div className="flex flex-wrap gap-2">
              {r.actions.filter((a) => a !== "replace" || replacements.length > 0).map((a) =>
                a === "replace" ? (
                  <OpsAction
                    key={a}
                    variant="secondary"
                    run={careReplaceAction.bind(null, { shiftId: r.id, expectedVersion: r.version })}
                    labels={{
                      label: t("actions.replace"),
                      done: t("done"),
                      confirm: { title: t("replaceTitle"), description: t("replaceBody"), confirmLabel: t("replaceConfirm") },
                      reason: { label: t("replacementLabel"), placeholder: tr("selectPlaceholder"), required: t("replacementRequired"), options: replacements.map((c) => ({ value: c.resourceId, label: c.label })) },
                    }}
                  />
                ) : (
                  <OpsAction
                    key={a}
                    variant={a === "absent" ? "secondary" : "primary"}
                    tone={a === "absent" ? "danger" : "primary"}
                    run={careShiftAction.bind(null, { shiftId: r.id, step: a, expectedVersion: r.version })}
                    labels={{
                      label: t(`actions.${a}`),
                      done: t("done"),
                      ...(a === "absent"
                        ? {
                            confirm: { title: t("absentTitle"), description: t("absentBody"), confirmLabel: t("actions.absent") },
                            reason: { label: tr("reasonLabel"), placeholder: tr("reasonPlaceholder"), required: tr("reasonRequired"), options: ABSENCE.map((x) => ({ value: x, label: ta(x) })) },
                          }
                        : {}),
                    }}
                  />
                ),
              )}
            </div>
          ),
        },
      ]}
    />
  );
}

export function CareShiftsView({ result }: { result: LoaderResult<{ groups: ShiftGroup[]; replacements: { resourceId: string; label: string }[] }> }) {
  const t = useTranslations("caretaker.shifts");
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <LoaderState result={result} empty={{ title: t("emptyTitle"), description: t("emptyBody") }}>
        {(d) => (
          <div className="grid gap-8">
            {d.groups.map((g) => (
              <section key={g.assignmentId} aria-labelledby={`shift-${g.assignmentId}`} className="grid gap-3">
                <h2 id={`shift-${g.assignmentId}`} className="text-xl font-semibold text-ink">
                  {g.reference}
                </h2>
                <ShiftTable rows={g.shifts} replacements={d.replacements} label={g.reference} />
              </section>
            ))}
          </div>
        )}
      </LoaderState>
    </div>
  );
}

export function CareAssignmentDetailView({ result }: { result: LoaderResult<{ assignment: AssignmentRowVM; shifts: ShiftRowVM[] | null }> }) {
  const t = useTranslations("caretaker.assignments");
  const tk = useKeyTranslator();
  const locale = useAppLocale();
  const title = result.status === "ok" ? t("detailTitle", { reference: result.data.assignment.reference }) : t("title");
  return (
    <div className="grid gap-8">
      <PageHeader
        title={title}
        breadcrumb={
          <Link href="/caretaker/assignments" className="text-base text-forest underline underline-offset-4">
            {t("back")}
          </Link>
        }
      />
      <ScopeNote />
      <LoaderState result={result} empty={{ title }}>
        {(d) => (
          <div className="grid gap-8">
            <div className="flex flex-wrap items-center gap-3">
              <OpsStatus status={d.assignment.status} />
              <span className="text-base text-ink">{formatWindow(d.assignment.start, d.assignment.end, locale)}</span>
              <span className="text-base text-muted">{d.assignment.tasks.map((s) => tk(s.labelKey)).join(", ")}</span>
            </div>
            {d.assignment.interruptionKey ? <Notice tone="warning">{tk(d.assignment.interruptionKey)}</Notice> : null}
            <AssignmentActions row={d.assignment} />
            <section aria-labelledby="asg-shifts" className="grid gap-3">
              <h2 id="asg-shifts" className="text-xl font-semibold text-ink">
                {t("shiftsTitle")}
              </h2>
              {d.shifts ? <ShiftTable rows={d.shifts} replacements={[]} label={t("shiftsTitle")} /> : <Notice tone="warning">{t("shiftsUnavailable")}</Notice>}
            </section>
          </div>
        )}
      </LoaderState>
    </div>
  );
}

export function CarePlansView() {
  const t = useTranslations("caretaker.plans");
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} />
      <NotConnected title={t("gated.scheduler_and_policy_not_approved")} body={t("body")} />
    </div>
  );
}

export function CareNotConnectedView({ section }: { section: "billing" | "support" | "availability" }) {
  const t = useTranslations(`caretaker.${section}`);
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} />
      <NotConnected body={t("body")} />
    </div>
  );
}

import { useLocale, useTranslations } from "next-intl";
import { formatDateTime, formatPaise, formatWindow } from "@/components/admin/ops/format";
import { MetricTile } from "@/components/admin/ops/metric-tile";
import { OpsAction } from "@/components/admin/ops/ops-action";
import { OpsStatus, useKeyTranslator } from "@/components/admin/ops/ops-status";
import { DetailGrid, RecordList } from "@/components/admin/ops/record-list";
import { LoaderState, NotConnected } from "@/components/admin/ops/states";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import type { LoaderResult } from "@/modules/admin/access";
import type { LabOrderQueue } from "@/modules/lab/api";
import { LAB_FAILURE_REASONS } from "@/modules/lab/rules";
import { labBranchAction, labCatalogAction, labCollectionAction, labRecollectionAction, labReportAction } from "@/modules/lab/server-actions";
import type {
  BranchRowVM,
  CatalogRowVM,
  CollectionJobVM,
  LabDashboardVM,
  OrderDetailVM,
  OrderRowVM,
  ReportRowVM,
  StaffRowVM,
} from "@/modules/lab/view-models";
import { CatalogEditForm } from "./catalog-edit-form";

const useAppLocale = () => useLocale() as AppLocale;

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function LabDashboardView({ result, workspaceName }: { result: LoaderResult<LabDashboardVM>; workspaceName: string }) {
  const t = useTranslations("lab.dashboard");
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description", { name: workspaceName })} />
      <LoaderState result={result} empty={{ title: t("title") }}>
        {(vm) => (
          <div className="grid gap-10">
            {vm.manager ? (
              <section aria-labelledby="lab-dash-manager" className="grid gap-4">
                <h2 id="lab-dash-manager" className="text-xl font-semibold text-ink">
                  {t("managerSection")}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricTile label={t("metrics.today")} metric={vm.manager.today} href="/lab/orders?queue=today" testId="metric-today" />
                  <MetricTile label={t("metrics.pending")} metric={vm.manager.pending} href="/lab/orders?queue=pending" testId="metric-pending" />
                  <MetricTile label={t("metrics.processing")} metric={vm.manager.processing} href="/lab/orders?queue=processing" testId="metric-processing" />
                  <MetricTile label={t("metrics.exceptions")} metric={vm.manager.exceptions} href="/lab/orders?queue=exceptions" testId="metric-exceptions" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-ink">{t("branchesTitle")}</h3>
                {vm.manager.branches ? <BranchList rows={vm.manager.branches} withActions={false} /> : <Notice tone="warning">{t("branchesUnavailable")}</Notice>}
              </section>
            ) : null}
            {vm.collector ? (
              <section aria-labelledby="lab-dash-collector" className="grid gap-4">
                <h2 id="lab-dash-collector" className="text-xl font-semibold text-ink">
                  {t("collectorSection")}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricTile label={t("metrics.assigned")} metric={vm.collector.assigned} href="/lab/collections" testId="metric-assigned" />
                </div>
              </section>
            ) : null}
            {vm.reviewer ? (
              <section aria-labelledby="lab-dash-reviewer" className="grid gap-4">
                <h2 id="lab-dash-reviewer" className="text-xl font-semibold text-ink">
                  {t("reviewerSection")}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricTile label={t("metrics.awaitingReview")} metric={vm.reviewer.awaitingReview} href="/lab/reports" testId="metric-review" />
                  <MetricTile label={t("metrics.awaitingRelease")} metric={vm.reviewer.awaitingRelease} href="/lab/reports" testId="metric-release" />
                </div>
              </section>
            ) : null}
          </div>
        )}
      </LoaderState>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

function BranchList({ rows, withActions }: { rows: BranchRowVM[]; withActions: boolean }) {
  const t = useTranslations("lab.branches");
  return (
    <RecordList
      label={t("title")}
      rows={rows}
      rowKey={(r) => r.id}
      columns={[
        { key: "name", header: t("columns.name"), primary: true, cell: (r) => r.name },
        { key: "address", header: t("columns.address"), cell: (r) => `${r.locality}, ${r.city} ${r.pin}` },
        { key: "coverage", header: t("columns.coverage"), cell: (r) => (r.homeCollectionPins.length ? r.homeCollectionPins.join(", ") : t("noCoverage")) },
        { key: "verification", header: t("columns.verification"), cell: (r) => <OpsStatus status={r.verification} /> },
        { key: "status", header: t("columns.status"), cell: (r) => <OpsStatus status={r.active} /> },
        ...(withActions ? [{ key: "actions", header: t("columns.actions"), cell: (r: BranchRowVM) => <BranchToggle row={r} /> }] : []),
      ]}
    />
  );
}

function BranchToggle({ row }: { row: BranchRowVM }) {
  const t = useTranslations("lab.branches");
  const isActive = row.active.labelKey === "lab.status.catalog.active";
  if (!isActive && !row.canToggleActive) return <span className="text-sm text-muted">{t("activationNote")}</span>;
  return (
    <OpsAction
      variant="secondary"
      tone={isActive ? "danger" : "primary"}
      run={labBranchAction.bind(null, { branchId: row.id, active: !isActive, expectedVersion: row.version })}
      labels={{
        label: isActive ? t("deactivate") : t("activate"),
        done: t("done"),
        confirm: {
          title: isActive ? t("deactivateConfirmTitle", { name: row.name }) : t("activateConfirmTitle", { name: row.name }),
          description: isActive ? t("deactivateConfirmBody") : t("activateConfirmBody"),
          confirmLabel: isActive ? t("deactivate") : t("activate"),
        },
      }}
    />
  );
}

export function LabBranchesView({ result }: { result: LoaderResult<BranchRowVM[]> }) {
  const t = useTranslations("lab.branches");
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <LoaderState result={result} empty={{ title: t("emptyTitle"), description: t("emptyBody") }}>
        {(rows) => <BranchList rows={rows} withActions />}
      </LoaderState>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export function LabCatalogView({ result }: { result: LoaderResult<CatalogRowVM[]> }) {
  const t = useTranslations("lab.catalog");
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
              { key: "name", header: t("columns.name"), primary: true, cell: (r) => r.name },
              { key: "kind", header: t("columns.kind"), cell: (r) => (r.kind === "package" ? t("kind.package", { count: r.includedCount }) : t("kind.test")) },
              { key: "specimen", header: t("columns.specimen"), cell: (r) => tk(r.specimenKey) },
              { key: "preparation", header: t("columns.preparation"), cell: (r) => r.preparation },
              { key: "price", header: t("columns.price"), cell: (r) => <span className="tabular">{formatPaise(r.pricePaise, locale)}</span> },
              { key: "collection", header: t("columns.collection"), cell: (r) => tk(r.collectionTypeKey) },
              { key: "turnaround", header: t("columns.turnaround"), cell: (r) => (r.turnaroundHours === null ? t("turnaroundHidden") : t("turnaroundHours", { hours: r.turnaroundHours })) },
              { key: "status", header: t("columns.status"), cell: (r) => <OpsStatus status={r.active} /> },
              {
                key: "actions",
                header: t("columns.actions"),
                cell: (r) => (
                  <CatalogEditForm
                    initial={{ price: (r.pricePaise / 100).toFixed(2), preparation: r.preparation, active: r.active.labelKey === "lab.status.catalog.active" }}
                    run={labCatalogAction.bind(null, { itemId: r.id, expectedVersion: r.version })}
                    labels={{
                      edit: t("edit"),
                      title: t("editTitle", { name: r.name }),
                      price: t("priceLabel"),
                      priceHint: t("priceHint"),
                      preparation: t("preparationLabel"),
                      preparationHint: t("preparationHint"),
                      active: t("activeLabel"),
                      save: t("save"),
                      saved: t("saved"),
                      priceInvalid: t("priceInvalid"),
                      preparationInvalid: t("preparationInvalid"),
                    }}
                  />
                ),
              },
            ]}
          />
        )}
      </LoaderState>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export function LabStaffView({ result }: { result: LoaderResult<StaffRowVM[]> }) {
  const t = useTranslations("lab.staff");
  const tk = useKeyTranslator();
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <NotConnected body={t("inviteNotConnected")} />
      <LoaderState result={result} empty={{ title: t("emptyTitle"), description: t("emptyBody") }}>
        {(rows) => (
          <RecordList
            label={t("title")}
            rows={rows}
            rowKey={(r) => r.membershipId}
            columns={[
              { key: "name", header: t("columns.name"), primary: true, cell: (r) => r.displayName },
              { key: "roles", header: t("columns.roles"), cell: (r) => r.roleKeys.map((k) => tk(k)).join(", ") },
              { key: "branches", header: t("columns.branches"), cell: (r) => r.branchNames.join(", ") },
              { key: "membership", header: t("columns.membership"), cell: (r) => <OpsStatus status={r.membership} /> },
              { key: "credential", header: t("columns.credential"), cell: (r) => <OpsStatus status={r.credential} /> },
            ]}
          />
        )}
      </LoaderState>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const LAB_QUEUES: readonly LabOrderQueue[] = ["pending", "today", "processing", "exceptions"];

export function LabOrdersView({ result, queue }: { result: LoaderResult<{ rows: OrderRowVM[]; nextCursor: string | null }>; queue: LabOrderQueue }) {
  const t = useTranslations("lab.orders");
  const locale = useAppLocale();
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <nav aria-label={t("queueNav")}>
        <ul className="flex flex-wrap gap-2">
          {LAB_QUEUES.map((q) => (
            <li key={q}>
              <Link
                href={{ pathname: "/lab/orders", query: { queue: q } }}
                aria-current={q === queue ? "page" : undefined}
                className="inline-flex min-h-target items-center rounded-full border border-border px-4 text-base text-ink hover:bg-mist aria-[current=page]:border-forest aria-[current=page]:bg-mist aria-[current=page]:font-semibold aria-[current=page]:text-forest"
              >
                {t(`queues.${q}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <LoaderState result={result} empty={{ title: t("emptyTitle"), description: t("emptyBody") }}>
        {(data) => (
          <RecordList
            label={t(`queues.${queue}`)}
            rows={data.rows}
            rowKey={(r) => r.id}
            columns={[
              {
                key: "reference",
                header: t("columns.reference"),
                primary: true,
                cell: (r) => (
                  <Link href={`/lab/orders/${encodeURIComponent(r.id)}`} className="font-semibold text-forest underline underline-offset-4">
                    {r.reference}
                  </Link>
                ),
              },
              { key: "window", header: t("columns.window"), cell: (r) => formatWindow(r.windowStart, r.windowEnd, locale) },
              { key: "pin", header: t("columns.pin"), cell: (r) => <span className="tabular">{r.servicePin}</span> },
              { key: "tests", header: t("columns.tests"), cell: (r) => t("testCount", { count: r.lineCount }) },
              {
                key: "total",
                header: t("columns.total"),
                cell: (r) => (r.totalsConsistent ? <span className="tabular">{formatPaise(r.totalPaise, locale)}</span> : <span className="text-danger">{t("totalsMismatch")}</span>),
              },
              { key: "collector", header: t("columns.collector"), cell: (r) => r.collectorName ?? t("unassigned") },
              { key: "status", header: t("columns.status"), cell: (r) => <OpsStatus status={r.status} /> },
            ]}
          />
        )}
      </LoaderState>
    </div>
  );
}

export function LabOrderDetailView({ result }: { result: LoaderResult<OrderDetailVM> }) {
  const t = useTranslations("lab.orderDetail");
  const tk = useKeyTranslator();
  const locale = useAppLocale();
  const title = result.status === "ok" ? t("title", { reference: result.data.reference }) : t("testsTitle");
  return (
    <div className="grid gap-8">
      <PageHeader
        title={title}
        breadcrumb={
          <Link href="/lab/orders" className="text-base text-forest underline underline-offset-4">
            {t("back")}
          </Link>
        }
      />
      <LoaderState result={result} empty={{ title }}>
        {(o) => (
          <div className="grid gap-10">
            <section aria-labelledby="order-collection" className="grid gap-4">
              <h2 id="order-collection" className="text-xl font-semibold text-ink">
                {t("detailsTitle")}
              </h2>
              <DetailGrid
                items={[
                  { label: t("fields.status"), value: <OpsStatus status={o.status} /> },
                  { label: t("fields.window"), value: formatWindow(o.windowStart, o.windowEnd, locale) },
                  { label: t("fields.pin"), value: o.servicePin },
                  { label: t("fields.collector"), value: o.collectorName ?? "—" },
                  { label: t("fields.policy"), value: o.policyVersion },
                  { label: t("fields.priceSnapshot"), value: formatDateTime(o.priceSnapshotAt, locale) },
                  ...(o.failureReasonKey ? [{ label: t("fields.failure"), value: tk(o.failureReasonKey) }] : []),
                ]}
              />
              {o.isRecollection ? <Notice tone="info">{t("isRecollection")}</Notice> : null}
              <p className="text-sm text-muted">{t("paymentNote")}</p>
              {o.canRequestRecollection ? (
                <div>
                  <OpsAction
                    run={labRecollectionAction.bind(null, { orderId: o.id })}
                    labels={{
                      label: t("recollect"),
                      done: t("recollectDone"),
                      confirm: { title: t("recollectConfirmTitle"), description: t("recollectConfirmBody"), confirmLabel: t("recollect") },
                    }}
                  />
                </div>
              ) : null}
            </section>
            <section aria-labelledby="order-tests" className="grid gap-4">
              <h2 id="order-tests" className="text-xl font-semibold text-ink">
                {t("testsTitle")}
              </h2>
              <RecordList
                label={t("testsTitle")}
                rows={o.lines}
                rowKey={(l) => l.catalogItemId}
                columns={[
                  { key: "name", header: t("lineColumns.name"), primary: true, cell: (l) => l.name },
                  { key: "qty", header: t("lineColumns.quantity"), cell: (l) => <span className="tabular">{l.quantity}</span> },
                  { key: "unit", header: t("lineColumns.unitPrice"), cell: (l) => <span className="tabular">{formatPaise(l.unitPricePaise, locale)}</span> },
                  { key: "line", header: t("lineColumns.lineTotal"), cell: (l) => <span className="tabular">{formatPaise(l.lineTotalPaise, locale)}</span> },
                ]}
              />
              {o.totalsConsistent ? (
                <p className="text-lg font-semibold text-ink">
                  {t("total")}: <span className="tabular">{formatPaise(o.totalPaise, locale)}</span>
                </p>
              ) : (
                <Notice tone="danger">{t("totalsMismatch")}</Notice>
              )}
            </section>
            <section aria-labelledby="order-history" className="grid gap-4">
              <h2 id="order-history" className="text-xl font-semibold text-ink">
                {t("historyTitle")}
              </h2>
              <ol className="grid gap-3">
                {o.history.map((h, i) => (
                  <li key={`${h.at}-${i}`} className="flex flex-wrap items-center gap-3">
                    <OpsStatus status={h.status} />
                    <time dateTime={h.at} className="text-sm text-muted">
                      {formatDateTime(h.at, locale)}
                    </time>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </LoaderState>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collections (assigned collector only)
// ---------------------------------------------------------------------------

export function LabCollectionsView({ result }: { result: LoaderResult<CollectionJobVM[]> }) {
  const t = useTranslations("lab.collections");
  const tf = useTranslations("lab.failure");
  const locale = useAppLocale();
  const reasonOptions = LAB_FAILURE_REASONS.map((r) => ({ value: r, label: tf(r) }));
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <LoaderState result={result} empty={{ title: t("emptyTitle"), description: t("emptyBody") }}>
        {(rows) => (
          <RecordList
            label={t("title")}
            rows={rows}
            rowKey={(r) => r.orderId}
            columns={[
              { key: "reference", header: t("columns.reference"), primary: true, cell: (r) => r.reference },
              { key: "window", header: t("columns.window"), cell: (r) => formatWindow(r.windowStart, r.windowEnd, locale) },
              { key: "pin", header: t("columns.pin"), cell: (r) => <span className="tabular">{r.servicePin}</span> },
              { key: "status", header: t("columns.status"), cell: (r) => <OpsStatus status={r.status} /> },
              {
                key: "actions",
                header: t("columns.actions"),
                cell: (r) => (
                  <div className="flex flex-wrap gap-2">
                    {r.actions.map((a) => (
                      <OpsAction
                        key={a.action}
                        variant={a.needsReason ? "secondary" : "primary"}
                        tone={a.needsReason ? "danger" : "primary"}
                        run={labCollectionAction.bind(null, { orderId: r.orderId, action: a.action, expectedVersion: r.version, branchId: r.branchId })}
                        labels={{
                          label: t(`actions.${a.action}`),
                          done: t("done"),
                          confirm: {
                            title: t("confirmTitle", { action: t(`actions.${a.action}`), reference: r.reference }),
                            description: t("confirmBody"),
                            confirmLabel: t(`actions.${a.action}`),
                          },
                          ...(a.needsReason
                            ? { reason: { label: t("reasonLabel"), placeholder: t("reasonPlaceholder"), required: t("reasonRequired"), options: reasonOptions } }
                            : {}),
                        }}
                      />
                    ))}
                  </div>
                ),
              },
            ]}
          />
        )}
      </LoaderState>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reports (reviewer only; release gated by the clinical gate)
// ---------------------------------------------------------------------------

export function LabReportsView({ result }: { result: LoaderResult<ReportRowVM[]> }) {
  const t = useTranslations("lab.reports");
  const tk = useKeyTranslator();
  const locale = useAppLocale();
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} meta={t("privateNote")} />
      <LoaderState result={result} gateFeature="clinical" empty={{ title: t("emptyTitle"), description: t("emptyBody") }}>
        {(rows) => (
          <RecordList
            label={t("title")}
            rows={rows}
            rowKey={(r) => r.id}
            columns={[
              { key: "order", header: t("columns.order"), primary: true, cell: (r) => r.orderReference },
              { key: "version", header: t("columns.version"), cell: (r) => t("version", { n: r.fileVersion }) },
              { key: "uploaded", header: t("columns.uploaded"), cell: (r) => formatDateTime(r.uploadedAt, locale) },
              { key: "status", header: t("columns.status"), cell: (r) => <OpsStatus status={r.status} /> },
              {
                key: "actions",
                header: t("columns.actions"),
                cell: (r) => (
                  <div className="flex flex-wrap items-center gap-2">
                    {r.canReview ? (
                      <OpsAction
                        variant="secondary"
                        run={labReportAction.bind(null, { reportId: r.id, expectedVersion: r.version, step: "review" })}
                        labels={{
                          label: t("review"),
                          done: t("done"),
                          confirm: { title: t("reviewConfirmTitle"), description: t("reviewConfirmBody", { n: r.fileVersion, reference: r.orderReference }), confirmLabel: t("review") },
                        }}
                      />
                    ) : null}
                    {r.canRelease ? (
                      <OpsAction
                        run={labReportAction.bind(null, { reportId: r.id, expectedVersion: r.version, step: "release" })}
                        labels={{
                          label: t("release"),
                          done: t("done"),
                          confirm: { title: t("releaseConfirmTitle"), description: t("releaseConfirmBody", { n: r.fileVersion, reference: r.orderReference }), confirmLabel: t("release") },
                        }}
                      />
                    ) : r.releaseBlockedKey ? (
                      <span className="text-sm text-muted">{tk(r.releaseBlockedKey)}</span>
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
        )}
      </LoaderState>
    </div>
  );
}

export function LabNotConnectedView({ section }: { section: "billing" | "support" }) {
  const t = useTranslations(`lab.${section}`);
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} />
      <NotConnected body={t("body")} />
    </div>
  );
}

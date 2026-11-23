import { Phone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { CursorPager } from "@/components/admin/ops/cursor-pager";
import { formatDate, formatDateTime, formatPaiseOrDash, formatWindow } from "@/components/admin/ops/format";
import { MetricTile } from "@/components/admin/ops/metric-tile";
import { OpsAction } from "@/components/admin/ops/ops-action";
import { OpsStatus, useKeyTranslator } from "@/components/admin/ops/ops-status";
import { DetailGrid, RecordList } from "@/components/admin/ops/record-list";
import { LoaderState, NotConnected } from "@/components/admin/ops/states";
import { EmptyState } from "@/components/shared/empty-state";
import { GateNotice } from "@/components/shared/gate-notice";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import type { LoaderResult } from "@/modules/admin/access";
import type { TripQueue } from "@/modules/ambulance/api";
import type { EmergencyGuidance } from "@/modules/ambulance/emergency";
import type { AssignOption } from "@/modules/ambulance/loaders";
import { DECLINE_REASONS, TRIP_INTERRUPT_REASONS } from "@/modules/ambulance/rules";
import { ambulanceAcceptAction, ambulanceDeclineAction, ambulanceTripAction } from "@/modules/ambulance/server-actions";
import type {
  AmbulanceDashboardVM,
  CrewRowVM,
  DriverQueueVM,
  RequestRowVM,
  TripRowVM,
  VehicleRowVM,
} from "@/modules/ambulance/view-models";
import { AcceptRequestForm } from "./accept-request-form";

const useAppLocale = () => useLocale() as AppLocale;
const place = (p: { locality: string; city: string; pin: string | null }) => [p.locality, p.city, p.pin].filter(Boolean).join(", ");

export function AmbulanceDashboardView({ result, workspaceName }: { result: LoaderResult<AmbulanceDashboardVM>; workspaceName: string }) {
  const t = useTranslations("ambulance.dashboard");
  const locale = useAppLocale();
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description", { name: workspaceName })} />
      <LoaderState result={result} empty={{ title: t("title") }}>
        {(vm) => (
          <div className="grid gap-10">
            {vm.operator ? (
              <section aria-labelledby="amb-dash-op" className="grid gap-4">
                <h2 id="amb-dash-op" className="text-xl font-semibold text-ink">
                  {t("operatorSection")}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricTile label={t("metrics.pendingRequests")} metric={vm.operator.pendingRequests} href="/ambulance/requests" testId="metric-pending-requests" />
                  <MetricTile label={t("metrics.todayTrips")} metric={vm.operator.todayTrips} href="/ambulance/trips?queue=today" testId="metric-today-trips" />
                  <MetricTile label={t("metrics.assignableVehicles")} metric={vm.operator.assignableVehicles} href="/ambulance/fleet" testId="metric-vehicles" />
                  <MetricTile label={t("metrics.assignableDrivers")} metric={vm.operator.assignableDrivers} href="/ambulance/crew" testId="metric-drivers" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-ink">{t("expiringTitle")}</h3>
                {vm.operator.expiring === null ? (
                  <Notice tone="warning">{t("expiringUnavailable")}</Notice>
                ) : vm.operator.expiring.length === 0 ? (
                  <p className="text-base text-muted">{t("expiringNone")}</p>
                ) : (
                  <ul className="grid gap-2">
                    {vm.operator.expiring.map((w) => (
                      <li key={`${w.kind}-${w.resourceId}`} className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface p-3">
                        <span className="font-semibold text-ink">{w.label}</span>
                        <span className="text-sm text-muted">{formatDate(w.expiresAt, locale)}</span>
                        <span className={w.daysLeft < 0 ? "text-sm font-semibold text-danger" : "text-sm font-semibold text-warning-text"}>
                          {w.daysLeft < 0 ? t("expiredDays") : t("daysLeft", { count: w.daysLeft })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}
            {vm.driver ? (
              <section aria-labelledby="amb-dash-driver" className="grid gap-4">
                <h2 id="amb-dash-driver" className="text-xl font-semibold text-ink">
                  {t("driverSection")}
                </h2>
                {vm.driver.current ? (
                  <Link href="/ambulance/driver" className="grid min-h-target gap-1 rounded-lg border border-border bg-surface p-5 text-ink hover:bg-mist">
                    <span className="font-semibold">{vm.driver.current.reference}</span>
                    <span className="text-sm text-muted">{formatWindow(vm.driver.current.windowStart, vm.driver.current.windowEnd, locale)}</span>
                  </Link>
                ) : (
                  <p className="text-base text-muted">{t("noCurrentTrip")}</p>
                )}
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricTile label={t("metrics.laterTrips")} metric={vm.driver.laterCount} testId="metric-later" />
                </div>
              </section>
            ) : null}
          </div>
        )}
      </LoaderState>
    </div>
  );
}

function VehicleList({ rows }: { rows: VehicleRowVM[] }) {
  const t = useTranslations("ambulance.fleet");
  const locale = useAppLocale();
  return (
    <RecordList
      label={t("title")}
      rows={rows}
      rowKey={(r) => r.resourceId}
      columns={[
        { key: "label", header: t("columns.label"), primary: true, cell: (r) => r.label },
        { key: "registration", header: t("columns.registration"), cell: (r) => <span className="tabular">{r.registrationNumber}</span> },
        { key: "type", header: t("columns.type"), cell: (r) => <OpsStatus status={r.type} /> },
        { key: "verification", header: t("columns.verification"), cell: (r) => <OpsStatus status={r.verification} /> },
        { key: "expiry", header: t("columns.expiry"), cell: (r) => formatDate(r.evidenceExpiresAt, locale) },
        { key: "availability", header: t("columns.availability"), cell: (r) => <OpsStatus status={r.availability} /> },
        { key: "base", header: t("columns.base"), cell: (r) => r.baseLocality },
      ]}
    />
  );
}

function CrewList({ rows }: { rows: CrewRowVM[] }) {
  const t = useTranslations("ambulance.crew");
  const locale = useAppLocale();
  return (
    <RecordList
      label={t("title")}
      rows={rows}
      rowKey={(r) => r.resourceId}
      columns={[
        { key: "name", header: t("columns.name"), primary: true, cell: (r) => r.displayName },
        { key: "licence", header: t("columns.licence"), cell: (r) => <OpsStatus status={r.licence} /> },
        { key: "expiry", header: t("columns.expiry"), cell: (r) => formatDate(r.licenceExpiresAt, locale) },
        { key: "availability", header: t("columns.availability"), cell: (r) => <OpsStatus status={r.availability} /> },
        { key: "assignable", header: t("columns.assignable"), cell: (r) => (r.assignable ? t("yes") : t("no")) },
      ]}
    />
  );
}

export function FleetView({ result }: { result: LoaderResult<VehicleRowVM[]> }) {
  const t = useTranslations("ambulance.fleet");
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <LoaderState result={result} empty={{ title: t("emptyTitle"), description: t("emptyBody") }}>
        {(rows) => <VehicleList rows={rows} />}
      </LoaderState>
    </div>
  );
}

export function CrewView({ result }: { result: LoaderResult<CrewRowVM[]> }) {
  const t = useTranslations("ambulance.crew");
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <LoaderState result={result} empty={{ title: t("emptyTitle"), description: t("emptyBody") }}>
        {(rows) => <CrewList rows={rows} />}
      </LoaderState>
    </div>
  );
}

export function AvailabilityView({ result }: { result: LoaderResult<{ vehicles: VehicleRowVM[]; crew: CrewRowVM[] }> }) {
  const t = useTranslations("ambulance.availability");
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <LoaderState result={result} empty={{ title: t("emptyTitle"), description: t("emptyBody") }}>
        {(d) => (
          <div className="grid gap-10">
            {(["ready", "notReady"] as const).map((group) => (
              <section key={group} aria-labelledby={`avail-${group}`} className="grid gap-4">
                <h2 id={`avail-${group}`} className="text-xl font-semibold text-ink">
                  {t(group)}
                </h2>
                <h3 className="text-lg font-semibold text-ink">{t("vehiclesTitle")}</h3>
                <VehicleList rows={d.vehicles.filter((v) => v.assignable === (group === "ready"))} />
                <h3 className="text-lg font-semibold text-ink">{t("crewTitle")}</h3>
                <CrewList rows={d.crew.filter((c) => c.assignable === (group === "ready"))} />
              </section>
            ))}
          </div>
        )}
      </LoaderState>
    </div>
  );
}

export function RequestsView({
  result,
  cursor,
}: {
  result: LoaderResult<{ rows: RequestRowVM[]; nextCursor: string | null; vehicles: AssignOption[]; drivers: AssignOption[] }>;
  cursor?: string;
}) {
  const t = useTranslations("ambulance.requests");
  const td = useTranslations("ambulance.decline");
  const tk = useKeyTranslator();
  const locale = useAppLocale();
  const reasonOptions = DECLINE_REASONS.map((r) => ({ value: r, label: td(r) }));
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <LoaderState result={result} empty={{ title: t("emptyTitle"), description: t("emptyBody") }}>
        {(d) => (
          <>
            <RecordList
              label={t("title")}
              rows={d.rows}
              rowKey={(r) => r.id}
              columns={[
                { key: "reference", header: t("columns.reference"), primary: true, cell: (r) => r.reference },
                { key: "pickup", header: t("columns.pickup"), cell: (r) => place(r.pickup) },
                { key: "destination", header: t("columns.destination"), cell: (r) => place(r.destination) },
                { key: "window", header: t("columns.window"), cell: (r) => formatWindow(r.windowStart, r.windowEnd, locale) },
                { key: "requirement", header: t("columns.requirement"), cell: (r) => tk(r.requirementKey) },
                {
                  key: "quote",
                  header: t("columns.quote"),
                  cell: (r) =>
                    r.quote ? (
                      <div className="grid gap-1">
                        <span className="font-semibold tabular">{formatPaiseOrDash(r.quote.totalPaise)}</span>
                        <span className="text-sm text-muted">
                          {t("quoteBreakdown", { base: formatPaiseOrDash(r.quote.basePaise), distance: formatPaiseOrDash(r.quote.distancePaise), km: r.quote.distanceKm })}
                          {r.quote.fees.length ? ` ${t("quoteFees", { fees: formatPaiseOrDash(r.quote.fees.reduce((a, f) => a + f.amountPaise, 0)) })}` : ""}
                        </span>
                        <OpsStatus status={r.quote.status} />
                      </div>
                    ) : (
                      t("noQuote")
                    ),
                },
                {
                  key: "actions",
                  header: t("columns.actions"),
                  cell: (r) => (
                    <div className="grid gap-2">
                      {r.acceptBlockers.length === 0 ? (
                        <AcceptRequestForm
                          vehicles={d.vehicles}
                          drivers={d.drivers}
                          run={ambulanceAcceptAction.bind(null, { requestId: r.id, expectedVersion: r.version })}
                          labels={{
                            accept: t("accept"),
                            title: t("acceptTitle", { reference: r.reference }),
                            body: t("acceptBody"),
                            vehicle: t("vehicleLabel"),
                            driver: t("driverLabel"),
                            placeholder: t("selectPlaceholder"),
                            vehicleRequired: t("vehicleRequired"),
                            driverRequired: t("driverRequired"),
                            confirm: t("confirmAccept"),
                            done: t("accepted"),
                          }}
                        />
                      ) : (
                        <>
                          <button type="button" disabled className="min-h-target cursor-not-allowed rounded-md bg-disabled px-5 text-base text-disabled-text">
                            {t("accept")}
                          </button>
                          <ul className="grid gap-1 text-sm text-warning-text">
                            {r.acceptBlockers.map((b) => (
                              <li key={b}>{t(`blocked.${b}`)}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      {r.canDecline ? (
                        <OpsAction
                          variant="secondary"
                          tone="danger"
                          run={ambulanceDeclineAction.bind(null, { requestId: r.id, expectedVersion: r.version })}
                          labels={{
                            label: t("decline"),
                            done: t("declined"),
                            confirm: { title: t("declineTitle", { reference: r.reference }), description: t("declineBody"), confirmLabel: t("decline") },
                            reason: { label: t("reasonLabel"), placeholder: t("reasonPlaceholder"), required: t("reasonRequired"), options: reasonOptions },
                          }}
                        />
                      ) : null}
                    </div>
                  ),
                },
              ]}
            />
            <CursorPager pathname="/ambulance/requests" nextCursor={d.nextCursor} cursor={cursor} />
          </>
        )}
      </LoaderState>
    </div>
  );
}

export const TRIP_QUEUES: readonly TripQueue[] = ["today", "upcoming", "exceptions"];

export function TripsView({
  result,
  queue,
  cursor,
}: {
  result: LoaderResult<{ rows: TripRowVM[]; nextCursor: string | null }>;
  queue: TripQueue;
  cursor?: string;
}) {
  const t = useTranslations("ambulance.trips");
  const locale = useAppLocale();
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <nav aria-label={t("queueNav")}>
        <ul className="flex flex-wrap gap-2">
          {TRIP_QUEUES.map((q) => (
            <li key={q}>
              <Link
                href={{ pathname: "/ambulance/trips", query: { queue: q } }}
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
        {(d) => (
          <>
            <RecordList
              label={t(`queues.${queue}`)}
              rows={d.rows}
              rowKey={(r) => r.id}
              columns={[
                {
                  key: "reference",
                  header: t("columns.reference"),
                  primary: true,
                  cell: (r) => (
                    <Link href={`/ambulance/trips/${encodeURIComponent(r.id)}`} className="font-semibold text-forest underline underline-offset-4">
                      {r.reference}
                    </Link>
                  ),
                },
                { key: "window", header: t("columns.window"), cell: (r) => formatWindow(r.windowStart, r.windowEnd, locale) },
                { key: "vehicle", header: t("columns.vehicle"), cell: (r) => r.vehicleLabel },
                { key: "driver", header: t("columns.driver"), cell: (r) => r.driverName },
                { key: "status", header: t("columns.status"), cell: (r) => <OpsStatus status={r.status} /> },
              ]}
            />
            <CursorPager pathname="/ambulance/trips" query={{ queue }} nextCursor={d.nextCursor} cursor={cursor} />
          </>
        )}
      </LoaderState>
    </div>
  );
}

export function TripDetailView({ result }: { result: LoaderResult<TripRowVM> }) {
  const t = useTranslations("ambulance.tripDetail");
  const tk = useKeyTranslator();
  const locale = useAppLocale();
  const title = result.status === "ok" ? t("title", { reference: result.data.reference }) : t("back");
  return (
    <div className="grid gap-8">
      <PageHeader
        title={title}
        breadcrumb={
          <Link href="/ambulance/trips" className="text-base text-forest underline underline-offset-4">
            {t("back")}
          </Link>
        }
      />
      <LoaderState result={result} empty={{ title }}>
        {(trip) => (
          <div className="grid gap-8">
            <DetailGrid
              items={[
                { label: t("fields.status"), value: <OpsStatus status={trip.status} /> },
                { label: t("fields.window"), value: formatWindow(trip.windowStart, trip.windowEnd, locale) },
                { label: t("fields.pickup"), value: place(trip.pickup) },
                { label: t("fields.destination"), value: place(trip.destination) },
                { label: t("fields.requirement"), value: tk(trip.requirementKey) },
                { label: t("fields.vehicle"), value: trip.vehicleLabel },
                { label: t("fields.vehicleType"), value: <OpsStatus status={trip.vehicleType} /> },
                { label: t("fields.driver"), value: trip.driverName },
                ...(trip.interruptionKey ? [{ label: t("fields.interruption"), value: tk(trip.interruptionKey) }] : []),
              ]}
            />
            <p className="text-sm text-muted">{t("driverOnly")}</p>
            <section aria-labelledby="trip-history" className="grid gap-3">
              <h2 id="trip-history" className="text-xl font-semibold text-ink">
                {t("historyTitle")}
              </h2>
              <ol className="grid gap-3">
                {trip.history.map((h, i) => (
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

/** Driver view: one current trip, one next step, no ETA, map or countdown. */
export function DriverView({ result }: { result: LoaderResult<DriverQueueVM> }) {
  const t = useTranslations("ambulance.driver");
  const ti = useTranslations("ambulance.interrupt");
  const tk = useKeyTranslator();
  const locale = useAppLocale();
  const reasonOptions = TRIP_INTERRUPT_REASONS.map((r) => ({ value: r, label: ti(r) }));
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <LoaderState result={result} empty={{ title: t("noTripTitle"), description: t("noTripBody") }}>
        {(q) => (
          <div className="grid gap-6">
            {q.current ? (
              <section aria-labelledby="driver-trip" className="grid gap-5 rounded-lg border border-border bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id="driver-trip" className="font-display text-2xl font-medium text-ink">
                    {q.current.reference}
                  </h2>
                  <OpsStatus status={q.current.status} />
                </div>
                <DetailGrid
                  items={[
                    { label: t("fields.window"), value: formatWindow(q.current.windowStart, q.current.windowEnd, locale) },
                    { label: t("fields.pickup"), value: place(q.current.pickup) },
                    { label: t("fields.destination"), value: place(q.current.destination) },
                    { label: t("fields.requirement"), value: tk(q.current.requirementKey) },
                    { label: t("fields.vehicle"), value: q.current.vehicleLabel },
                  ]}
                />
                <div className="flex flex-wrap gap-3">
                  {q.current.nextAction ? (
                    <OpsAction
                      run={ambulanceTripAction.bind(null, { tripId: q.current.tripId, action: q.current.nextAction, expectedVersion: q.current.version })}
                      labels={{
                        label: t(`actions.${q.current.nextAction}`),
                        done: t("done"),
                        confirm: { title: t("confirmTitle", { action: t(`actions.${q.current.nextAction}`) }), description: t("confirmBody"), confirmLabel: t(`actions.${q.current.nextAction}`) },
                      }}
                    />
                  ) : null}
                  {q.current.canInterrupt ? (
                    <OpsAction
                      variant="secondary"
                      tone="danger"
                      run={ambulanceTripAction.bind(null, { tripId: q.current.tripId, action: "interrupt", expectedVersion: q.current.version })}
                      labels={{
                        label: t("interrupt"),
                        done: t("done"),
                        confirm: { title: t("interruptTitle"), description: t("interruptBody"), confirmLabel: t("interrupt") },
                        reason: { label: tk("ambulance.requests.reasonLabel"), placeholder: tk("ambulance.requests.reasonPlaceholder"), required: tk("ambulance.requests.reasonRequired"), options: reasonOptions },
                      }}
                    />
                  ) : null}
                </div>
              </section>
            ) : (
              <EmptyState title={t("noTripTitle")} description={t("noTripBody")} />
            )}
            <p className="text-base text-muted">{t("laterCount", { count: q.laterCount })}</p>
          </div>
        )}
      </LoaderState>
    </div>
  );
}

/** Emergency placeholder. Always unavailable; Call 108 is a plain tel: link that needs no JS or account. */
export function EmergencyView({ guidance }: { guidance: EmergencyGuidance }) {
  const t = useTranslations("ambulance.emergency");
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} />
      <section aria-labelledby="emergency-108" className="grid gap-4 rounded-lg border border-danger/30 bg-danger-surface p-6">
        <h2 id="emergency-108" className="text-xl font-semibold text-ink">
          {t("call112")}
        </h2>
        <a
          href={`tel:${guidance.callNumber}`}
          className="inline-flex min-h-12 w-fit items-center gap-2 rounded-md bg-danger px-6 text-lg font-semibold text-white hover:bg-danger-strong focus-visible:outline-2 focus-visible:outline-focus"
        >
          <Phone aria-hidden className="size-5" />
          {t("callButton")}
        </a>
      </section>
      <GateNotice feature="emergencyDispatch" title={t("dispatchUnavailable")}>
        {t("body")}
      </GateNotice>
    </div>
  );
}

export function AmbulanceNotConnectedView({ section }: { section: "billing" | "support" }) {
  const t = useTranslations(`ambulance.${section}`);
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} />
      <NotConnected body={t("body")} />
    </div>
  );
}

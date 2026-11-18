import { ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { badgeFor } from "@/components/clinical/kit";
import { getClinicalFormat } from "@/components/clinical/server-format";
import { guardDoctorPage } from "@/components/doctor/guard";
import { PageStateView } from "@/components/doctor/page-state-view";
import { RequestActions } from "@/components/doctor/request-actions";
import { getDoctorApi } from "@/modules/doctor";
import { loadRequestDetail, requestRespondState } from "@/modules/doctor/loaders";
import { describeBookingState } from "@/modules/doctor/status";
import { acceptRequestAction, declineRequestAction } from "../../actions";

export async function generateMetadata() {
  const t = await getTranslations("doctor.requests");
  return { title: t("title"), robots: { index: false } };
}

export default async function DoctorRequestPage({ params }: PageProps<"/[locale]/doctor/requests/[id]">) {
  const { locale, id } = await params;
  const g = await guardDoctorPage(locale, `/requests/${id}`);
  if (!g.ok) return g.view;
  const [t, nav, f] = await Promise.all([getTranslations("doctor.requests"), getTranslations("doctor.shell.nav"), getClinicalFormat()]);
  const state = await loadRequestDetail(getDoctorApi(process.env, g.session.ctx), id);
  const crumbs = <Breadcrumb items={[{ label: nav("requests"), href: "/doctor/requests" }, { label: state.kind === "ready" ? state.data.serviceName : t("title") }]} />;
  if (state.kind !== "ready") {
    return (
      <div className="grid gap-8">
        <PageHeader title={t("title")} breadcrumb={crumbs} />
        <PageStateView state={state} />
      </div>
    );
  }
  const r = state.data;
  const now = new Date();
  const respond = requestRespondState(r, now);
  const minutesLeft = respond.secondsLeft === null ? null : Math.ceil(respond.secondsLeft / 60);

  return (
    <div className="grid gap-8">
      <PageHeader
        title={r.serviceName}
        breadcrumb={crumbs}
        meta={<StatusBadge {...badgeFor(describeBookingState(r.state), f.tk)} />}
        description={r.respondBy ? (respond.open ? `${t("respondBy", { time: f.dateTime(r.respondBy) })} · ${t("respondLeft", { minutes: minutesLeft ?? 0 })}` : t("respondClosed")) : t("noDeadline")}
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {[
            [t("detail.when"), f.dateTime(r.scheduledStartAt)],
            [t("detail.area"), t("detail.areaValue", { locality: r.area.locality, pin: r.area.pin })],
            [t("detail.price"), f.money(r.quotedAmountPaise)],
            [t("detail.reference"), r.publicReference ?? t("detail.noReference")],
          ].map(([term, value]) => (
            <div key={term} className="grid gap-1 border-b border-border pb-4">
              <dt className="text-sm text-muted">{term}</dt>
              <dd className="text-lg font-semibold text-ink tabular">{value}</dd>
            </div>
          ))}
        </dl>
        <aside className="grid content-start gap-4">
          <p className="flex gap-3 text-base text-muted">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-forest" />
            {t("detail.privacy")}
          </p>
          <RequestActions bookingId={r.bookingId} version={r.version} open={respond.open} actions={{ accept: acceptRequestAction, decline: declineRequestAction }} />
        </aside>
      </div>
    </div>
  );
}

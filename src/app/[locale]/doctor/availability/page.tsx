import { getFormatter, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { badgeFor } from "@/components/clinical/kit";
import { getClinicalFormat } from "@/components/clinical/server-format";
import { guardDoctorPage } from "@/components/doctor/guard";
import { PageStateView } from "@/components/doctor/page-state-view";
import { Link } from "@/i18n/navigation";
import { getDoctorApi } from "@/modules/doctor";
import { toPageState } from "@/modules/doctor/routing";
import { buildSchedule, SCHEDULE_TIME_ZONE } from "@/modules/doctor/schedule";
import { describeBookingState } from "@/modules/doctor/status";

export async function generateMetadata() {
  const t = await getTranslations("doctor.pages.availability");
  return { title: t("title"), robots: { index: false } };
}

/**
 * Read-only 7-day schedule from the server's visit list (IST days). Editing weekly hours has no
 * backend contract yet (REQUESTS R-FE-D-35), so the page says so instead of showing dead controls.
 */
export default async function DoctorAvailabilityPage({ params }: PageProps<"/[locale]/doctor/availability">) {
  const { locale } = await params;
  const g = await guardDoctorPage(locale, "/availability");
  if (!g.ok) return g.view;
  const [t, fmt, { tk, time }] = await Promise.all([getTranslations("doctor.pages.availability"), getFormatter(), getClinicalFormat()]);
  const api = getDoctorApi(process.env, g.session.ctx);
  const now = new Date();
  const [visits, requests] = await Promise.all([api.listVisits(), api.listRequests()]);
  // Empty list is still a schedule (free days), so "empty" is not used here.
  const visitState = toPageState(visits);
  const pending = requests.ok ? requests.data.filter((r) => r.state === "requested").length : 0;
  const dayLabel = (d: Date) => fmt.dateTime(d, { weekday: "long", day: "numeric", month: "long", timeZone: SCHEDULE_TIME_ZONE });

  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <Notice tone="neutral" icon="lock" title={t("editTitle")}>
        {t("body")}
      </Notice>
      {pending > 0 ? (
        <Notice
          tone="info"
          action={
            <Button asChild variant="secondary">
              <Link href="/doctor/requests">{t("toRequests")}</Link>
            </Button>
          }
        >
          {t("pending", { count: pending })}
        </Notice>
      ) : null}
      {visitState.kind !== "ready" ? (
        <PageStateView state={visitState} />
      ) : (
        <section aria-labelledby="schedule-title" className="grid gap-4">
          <h2 id="schedule-title" className="text-lg font-semibold text-ink">
            {t("scheduleTitle")}
          </h2>
          <p className="text-sm text-muted">{t("scheduleHint")}</p>
          <ol className="grid gap-3">
            {buildSchedule(visitState.data, now).map((day, i) => (
              <li key={day.dayKey} className="grid gap-2 rounded-lg border border-border bg-surface p-4 sm:grid-cols-[13rem_1fr] sm:gap-4">
                <h3 className="font-semibold text-ink">
                  {i === 0 ? t("today", { day: dayLabel(day.date) }) : dayLabel(day.date)}
                </h3>
                {day.visits.length === 0 ? (
                  <p className="text-sm text-muted">{t("free")}</p>
                ) : (
                  <ul className="grid gap-2" aria-label={t("visitsOn", { day: dayLabel(day.date) })}>
                    {day.visits.map((v) => (
                      <li key={v.bookingId}>
                        <Link
                          href={`/doctor/visits/${v.bookingId}`}
                          className="flex min-h-target flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1 hover:bg-paper focus-visible:outline-3 focus-visible:outline-focus"
                        >
                          <span className="font-semibold tabular">{time(v.scheduledStartAt)}</span>
                          <span className="text-ink">{v.serviceName}</span>
                          <span className="text-sm text-muted tabular">{v.publicReference}</span>
                          <StatusBadge {...badgeFor(describeBookingState(v.state), tk)} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

import { Star } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/shared/empty-state";
import { GateNotice } from "@/components/shared/gate-notice";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/components/ui/cn";
import { guardDoctorPage } from "@/components/doctor/guard";
import { PageStateView } from "@/components/doctor/page-state-view";
import { isClinicalEnabled } from "@/modules/clinical/gate";
import { doctorReviewsView, getDoctorReviewsApi, type PublishedReview } from "@/modules/doctor-reviews";
import { toPageState } from "@/modules/doctor/routing";

export async function generateMetadata() {
  const t = await getTranslations("doctorReviews");
  return { title: t("title"), robots: { index: false } };
}

/**
 * Read-only list of published patient reviews about the signed-in doctor. Reviews still waiting for
 * moderation or not published are shown only as counts: no card, date or visit month, so a doctor
 * with few visits cannot work out which patient wrote one (ADVERSARIAL_REVIEW D2).
 */
export default async function DoctorReviewsPage({ params }: PageProps<"/[locale]/doctor/reviews">) {
  const { locale } = await params;
  const g = await guardDoctorPage(locale, "/reviews");
  if (!g.ok) return g.view;
  const [t, f] = await Promise.all([getTranslations("doctorReviews"), getFormatter()]);
  const header = <PageHeader title={t("title")} description={t("description")} />;
  const frame = (body: React.ReactNode) => (
    <div className="grid gap-8">
      {g.session.synthetic ? <p className="text-sm text-muted">{t("synthetic")}</p> : null}
      {header}
      {body}
    </div>
  );
  if (!isClinicalEnabled()) return frame(<GateNotice feature="clinical">{t("gated")}</GateNotice>);

  const r = await getDoctorReviewsApi(process.env, g.session.ctx).listMine();
  if (!r.ok) {
    const s = toPageState(r);
    return frame(s.kind === "ready" ? null : <PageStateView state={s} />);
  }
  if (r.data.length === 0) return frame(<EmptyState title={t("empty.title")} description={t("empty.body")} headingLevel="h2" />);
  const v = doctorReviewsView(r.data);
  const month = (ym: string) => f.dateTime(new Date(`${ym}-15T12:00:00+05:30`), { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

  return frame(
    <>
      <section aria-labelledby="reviews-summary" className="grid gap-2 rounded-lg border border-border bg-surface p-5">
        <h2 id="reviews-summary" className="text-lg font-semibold text-ink">
          {t("summary.title")}
        </h2>
        {v.average === null ? (
          <p className="text-ink">{t("summary.noPublished")}</p>
        ) : (
          <p className="flex flex-wrap items-baseline gap-x-2 text-ink">
            <span className="font-display text-3xl font-medium tabular">{f.number(v.average, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
            <span>{t("summary.average", { count: v.published.length })}</span>
          </p>
        )}
        <p className="text-sm text-muted">{t("summary.note")}</p>
      </section>

      {v.pending + v.rejected > 0 ? (
        <section aria-labelledby="reviews-unpublished" className="grid gap-2 rounded-lg border border-border bg-surface p-5">
          <h2 id="reviews-unpublished" className="text-lg font-semibold text-ink">
            {t("unpublished.title")}
          </h2>
          <ul className="grid gap-1 text-ink tabular">
            {v.pending > 0 ? <li>{t("unpublished.pending", { count: v.pending })}</li> : null}
            {v.rejected > 0 ? <li>{t("unpublished.rejected", { count: v.rejected })}</li> : null}
          </ul>
          <p className="text-sm text-muted">{t("unpublished.note")}</p>
        </section>
      ) : null}

      <section aria-labelledby="reviews-list" className="grid gap-3">
        <h2 id="reviews-list" className="sr-only">
          {t("list.label")}
        </h2>
        {v.published.length === 0 ? (
          <p className="text-muted">{t("list.nonePublished")}</p>
        ) : (
          <ul className="grid gap-3" aria-label={t("list.label")}>
            {v.published.map((rv) => (
              <ReviewCard key={rv.id} review={rv} month={month(rv.visitMonth)} submitted={f.dateTime(new Date(rv.submittedAt), { dateStyle: "medium", timeZone: "Asia/Kolkata" })} />
            ))}
          </ul>
        )}
      </section>
    </>,
  );
}

async function ReviewCard({ review: rv, month, submitted }: { review: PublishedReview; month: string; submitted: string }) {
  const t = await getTranslations("doctorReviews");
  return (
    <li className="grid gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-muted">{t("card.visit", { month })}</p>
      <p className="flex items-center gap-1 text-ink">
        <span className="flex" aria-hidden>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={cn("size-5", n <= rv.rating ? "fill-current text-warning-text" : "text-border-strong")} />
          ))}
        </span>
        <span className="ml-2 text-sm font-medium">{t("card.rating", { rating: rv.rating })}</span>
      </p>
      <p className="whitespace-pre-wrap text-ink">{rv.text}</p>
      <p className="text-xs text-muted tabular">{t("card.submitted", { date: submitted })}</p>
    </li>
  );
}

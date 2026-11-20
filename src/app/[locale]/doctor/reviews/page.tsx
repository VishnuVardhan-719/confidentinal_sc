import { Star } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/shared/empty-state";
import { GateNotice } from "@/components/shared/gate-notice";
import { PageHeader } from "@/components/shared/page-header";
import type { StatusDescriptor } from "@/components/shared/status";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/components/ui/cn";
import { guardDoctorPage } from "@/components/doctor/guard";
import { PageStateView } from "@/components/doctor/page-state-view";
import { Link } from "@/i18n/navigation";
import { isClinicalEnabled } from "@/modules/clinical/gate";
import { getDoctorReviewsApi, parseReviewFilter, REVIEW_FILTERS, sortReviews, summarizeReviews, type DoctorReview, type ReviewStatus } from "@/modules/doctor-reviews";
import { toPageState } from "@/modules/doctor/routing";

export async function generateMetadata() {
  const t = await getTranslations("doctorReviews");
  return { title: t("title"), robots: { index: false } };
}

const BADGE: Record<ReviewStatus, Omit<StatusDescriptor, "label">> = {
  published: { tone: "success", icon: "check" },
  pending_moderation: { tone: "info", icon: "clock" },
  rejected: { tone: "neutral", icon: "x" },
};

/** Read-only list of patient reviews about the signed-in doctor, with moderation badges. */
export default async function DoctorReviewsPage({ params, searchParams }: PageProps<"/[locale]/doctor/reviews">) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  const g = await guardDoctorPage(locale, "/reviews");
  if (!g.ok) return g.view;
  const [t, f] = await Promise.all([getTranslations("doctorReviews"), getFormatter()]);
  const filter = parseReviewFilter(sp.status);
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
  const all = sortReviews(r.data);
  if (all.length === 0) return frame(<EmptyState title={t("empty.title")} description={t("empty.body")} headingLevel="h2" />);
  const sum = summarizeReviews(all);
  const shown = filter === "all" ? all : all.filter((x) => x.status === filter);
  const count = (k: (typeof REVIEW_FILTERS)[number]) => (k === "all" ? all.length : k === "published" ? sum.published : k === "pending_moderation" ? sum.pending : sum.rejected);
  const month = (ym: string) => f.dateTime(new Date(`${ym}-15T12:00:00+05:30`), { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

  return frame(
    <>
      <section aria-labelledby="reviews-summary" className="grid gap-2 rounded-lg border border-border bg-surface p-5">
        <h2 id="reviews-summary" className="text-lg font-semibold text-ink">
          {t("summary.title")}
        </h2>
        {sum.average === null ? (
          <p className="text-ink">{t("summary.noPublished")}</p>
        ) : (
          <p className="flex flex-wrap items-baseline gap-x-2 text-ink">
            <span className="font-display text-3xl font-medium tabular">{f.number(sum.average, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
            <span>{t("summary.average", { count: sum.published })}</span>
          </p>
        )}
        <p className="text-sm text-muted">{t("summary.note")}</p>
      </section>

      <nav aria-label={t("filters.label")}>
        <ul className="flex flex-wrap gap-2">
          {REVIEW_FILTERS.map((k) => (
            <li key={k}>
              <Link
                href={k === "all" ? "/doctor/reviews" : `/doctor/reviews?status=${k}`}
                aria-current={filter === k ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-target items-center rounded-full border px-4 text-sm font-medium focus-visible:outline-3 focus-visible:outline-focus",
                  filter === k ? "border-forest bg-forest text-on-forest" : "border-border bg-surface text-ink hover:border-forest",
                )}
              >
                {t(`filters.${k}`, { count: count(k) })}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="reviews-list" className="grid gap-3">
        <h2 id="reviews-list" className="sr-only">
          {t("list.label")}
        </h2>
        {shown.length === 0 ? (
          <p className="text-muted">{t("list.noneForFilter")}</p>
        ) : (
          <ul className="grid gap-3" aria-label={t("list.label")}>
            {shown.map((rv) => (
              <ReviewCard key={rv.id} review={rv} month={month(rv.visitMonth)} submitted={f.dateTime(new Date(rv.submittedAt), { dateStyle: "medium", timeZone: "Asia/Kolkata" })} />
            ))}
          </ul>
        )}
      </section>
    </>,
  );
}

async function ReviewCard({ review: rv, month, submitted }: { review: DoctorReview; month: string; submitted: string }) {
  const t = await getTranslations("doctorReviews");
  return (
    <li className="grid gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{t("card.visit", { month })}</p>
        <StatusBadge {...BADGE[rv.status]} label={t(`status.${rv.status}`)} />
      </div>
      {rv.status === "published" ? (
        <>
          <p className="flex items-center gap-1 text-ink">
            <span className="flex" aria-hidden>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className={cn("size-5", n <= rv.rating ? "fill-current text-warning-text" : "text-border-strong")} />
              ))}
            </span>
            <span className="ml-2 text-sm font-medium">{t("card.rating", { rating: rv.rating })}</span>
          </p>
          <p className="whitespace-pre-wrap text-ink">{rv.text}</p>
        </>
      ) : (
        <p className="text-sm text-muted">{t(`card.hidden.${rv.status}`)}</p>
      )}
      <p className="text-xs text-muted tabular">{t("card.submitted", { date: submitted })}</p>
    </li>
  );
}

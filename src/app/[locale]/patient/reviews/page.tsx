import { PenLine, Star } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { GateNotice } from "@/components/shared/gate-notice";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { RetryAction } from "@/components/shared/retry-action";
import { KeyedStatusBadge } from "@/components/shared/status-badge";
import { PatientShell } from "@/components/patient/patient-shell";
import { Link } from "@/i18n/navigation";
import { fail } from "@/lib/api/result";
import { getPatientSession, patientLoginRedirect } from "@/modules/patient-dashboard/session";
import { describeReviewStatus, getReviewsApi, reviewEligibility, type ReviewableVisit } from "@/modules/reviews";

export async function generateMetadata() {
  const t = await getTranslations("patientAccount.reviews");
  return { title: t("title"), robots: { index: false } };
}

const toLocale = (l: string) => (l === "te" || l === "hi" ? l : "en");

/** Visits waiting for a review (completed, not yet reviewed) and the patient's submitted reviews with moderation state. */
export default async function ReviewsPage({ params, searchParams }: PageProps<"/[locale]/patient/reviews">) {
  const { locale: raw } = await params;
  await connection();
  const locale = toLocale(raw);
  const session = getPatientSession();
  if (session.status !== "ok") redirect(patientLoginRedirect(locale, `/${locale}/patient/reviews`));
  const [t, format, sp] = await Promise.all([getTranslations("patientAccount.reviews"), getFormatter(), searchParams]);
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeZone: "Asia/Kolkata" });
  const result = await getReviewsApi(process.env, session.fixtureActor).listVisits().catch(() => fail("unavailable"));
  if (!result.ok && result.error.code === "unauthenticated") redirect(patientLoginRedirect(locale, `/${locale}/patient/reviews`));

  const shell = (children: ReactNode) => (
    <PatientShell synthetic={session.synthetic}>
      <PageHeader title={t("title")} description={t("description")} />
      {sp.status === "sent" ? (
        <Notice tone="info" role="status">
          {t("flash")}
        </Notice>
      ) : null}
      {children}
    </PatientShell>
  );

  if (!result.ok) {
    const code = result.error.code;
    return shell(
      code === "gated" ? (
        <GateNotice reason="contract_pending">{t("state.gated")}</GateNotice>
      ) : code === "forbidden" ? (
        <Notice tone="neutral" icon="lock" title={t("state.denied")} />
      ) : (
        <InlineError code={code} action={<RetryAction />} />
      ),
    );
  }

  const due = result.data.filter((v) => reviewEligibility(v) === "can_review");
  const done = result.data.filter((v): v is ReviewableVisit & { review: NonNullable<ReviewableVisit["review"]> } => v.review !== null);

  if (due.length === 0 && done.length === 0) {
    return shell(
      <EmptyState
        title={t("empty.title")}
        description={t("empty.body")}
        action={
          <Button asChild variant="secondary">
            <Link href="/patient/bookings">{t("empty.action")}</Link>
          </Button>
        }
      />,
    );
  }

  return shell(
    <>
      <section aria-labelledby="reviews-due" className="grid gap-4">
        <h2 id="reviews-due" className="text-lg font-semibold text-ink">
          {t("dueLabel", { count: due.length })}
        </h2>
        {due.length === 0 ? (
          <p className="text-muted">{t("noneDue")}</p>
        ) : (
          <ul className="grid gap-3">
            {due.map((v) => (
              <li key={v.bookingId} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4">
                <div className="grid min-w-0 gap-0.5">
                  <p className="font-semibold break-words text-ink">{t("visit", { provider: v.providerDisplayName, reference: v.bookingReference })}</p>
                  {v.completedAt ? <p className="text-sm text-muted tabular">{t("completed", { date: date(v.completedAt) })}</p> : null}
                </div>
                <Button asChild>
                  <Link href={`/patient/reviews/${v.bookingId}`} aria-label={t("writeLabel", { provider: v.providerDisplayName })}>
                    <PenLine aria-hidden />
                    {t("write")}
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 ? (
        <section aria-labelledby="reviews-done" className="grid gap-4 border-t border-border pt-6">
          <h2 id="reviews-done" className="text-lg font-semibold text-ink">
            {t("doneLabel")}
          </h2>
          <ul className="grid gap-3">
            {done.map((v) => (
              <li key={v.bookingId} className="grid gap-3 rounded-lg border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid min-w-0 gap-0.5">
                    <p className="font-semibold break-words text-ink">{t("visit", { provider: v.providerDisplayName, reference: v.bookingReference })}</p>
                    <p className="text-sm text-muted tabular">{t("submittedOn", { date: date(v.review.submittedAt) })}</p>
                  </div>
                  <KeyedStatusBadge presentation={describeReviewStatus(v.review.status)} />
                </div>
                <p className="flex items-center gap-1 text-ink">
                  <span aria-hidden className="flex">
                    {Array.from({ length: v.review.rating }, (_, i) => (
                      <Star key={i} className="size-4 fill-current text-warning-text" />
                    ))}
                  </span>
                  <span className="text-sm">{t("stars", { rating: v.review.rating })}</span>
                </p>
                <p className="whitespace-pre-line break-words text-ink">{v.review.text}</p>
                {v.review.status === "pending_moderation" ? <p className="text-sm text-muted">{t("moderationNote")}</p> : null}
                {v.review.status === "rejected" ? <p className="text-sm text-muted">{t("rejectedNote")}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>,
  );
}

import { History, Star } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { AdminRouteGate } from "@/components/admin/admin-frame";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { cn } from "@/components/ui/cn";
import { GateNotice } from "@/components/shared/gate-notice";
import { InlineError } from "@/components/shared/inline-error";
import { IntlScope } from "@/components/shared/intl-scope";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { RetryAction } from "@/components/shared/retry-action";
import { KeyedStatusBadge } from "@/components/shared/status-badge";
import { Link } from "@/i18n/navigation";
import { fail } from "@/lib/api/result";
import { can } from "@/modules/admin/capabilities";
import { canModerate, describeReviewStatus, getReviewModerationApi, MODERATION_FILTERS, parseModerationFilter } from "@/modules/reviews";
import { decideReviewAction } from "./actions";
import { ModerationActions } from "./_components/moderation-actions";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("admin.nav"))("reviews"));
}

const DONE = { published: "published", rejected: "rejected", conflict: "conflict" } as const;

/**
 * Review moderation queue (capability `review:moderate`). Shows the booking reference, provider,
 * rating and text only; no patient identity, and no review id in the URL (filter only).
 */
export default async function ReviewModerationPage({ searchParams }: PageProps<"/[locale]/admin/reviews">) {
  const sp = await searchParams;
  const filter = parseModerationFilter(sp.status);
  const done = typeof sp.done === "string" && sp.done in DONE ? DONE[sp.done as keyof typeof DONE] : null;

  return (
    <AdminRouteGate route="reviews">
      {async (ctx) => {
        const [t, format] = await Promise.all([getTranslations("admin.reviews"), getFormatter()]);
        const header = (
          <PageHeader
            title={t("title")}
            description={t("description")}
            actions={
              <Link
                href="/admin/reviews/log"
                className="inline-flex min-h-target items-center gap-2 rounded-md border border-border bg-surface px-4 font-semibold text-ink transition-colors hover:border-forest hover:bg-mist focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <History aria-hidden className="size-4" />
                {t("log.link")}
              </Link>
            }
          />
        );
        const result = await getReviewModerationApi(process.env, can(ctx.principal, "review:moderate")).listQueue(filter).catch(() => fail("unavailable"));
        if (!result.ok) {
          return (
            <div className="grid gap-8">
              {header}
              {result.error.code === "gated" ? <GateNotice reason="contract_pending">{t("gated")}</GateNotice> : <InlineError code={result.error.code} action={<RetryAction />} />}
            </div>
          );
        }
        const items = result.data;
        return (
          <div className="grid gap-8">
            {header}
            <div role="status" className="empty:hidden">
              {done === "conflict" ? <Notice tone="warning">{t("conflict")}</Notice> : done ? <Notice tone="info">{t(done)}</Notice> : null}
            </div>
            <nav aria-label={t("filterLabel")} className="-mx-1 overflow-x-auto px-1 pb-1">
              <ul className="flex w-max gap-2">
                {MODERATION_FILTERS.map((f) => (
                  <li key={f}>
                    <Link
                      href={`/admin/reviews?status=${f}`}
                      aria-current={f === filter ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-target items-center rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus",
                        f === filter ? "border-forest bg-forest text-on-forest" : "border-border bg-surface text-ink hover:border-forest hover:bg-mist",
                      )}
                    >
                      {t(`filter.${f}`)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <section aria-labelledby="moderation-list" className="grid gap-4">
              <h2 id="moderation-list" className="text-lg font-semibold text-ink">
                {t(`filter.${filter}`)}: {t("count", { count: items.length })}
              </h2>
              {items.length === 0 ? (
                <p className="text-muted">{t(`empty.${filter}`)}</p>
              ) : (
                <ul className="grid gap-3">
                  {items.map((i) => (
                    <li key={i.reviewId} className="grid gap-3 rounded-lg border border-border bg-surface p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="grid min-w-0 gap-0.5">
                          <p className="font-semibold break-words text-ink">{t("item", { provider: i.providerDisplayName, reference: i.bookingReference })}</p>
                          <p className="text-sm text-muted tabular">{t("submitted", { date: format.dateTime(new Date(i.submittedAt), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) })}</p>
                        </div>
                        <KeyedStatusBadge presentation={describeReviewStatus(i.status)} />
                      </div>
                      <p className="flex items-center gap-1 text-ink">
                        <span aria-hidden className="flex">
                          {Array.from({ length: i.rating }, (_, n) => (
                            <Star key={n} className="size-4 fill-current text-warning-text" />
                          ))}
                        </span>
                        <span className="text-sm">{t("stars", { rating: i.rating })}</span>
                      </p>
                      <p className="whitespace-pre-line break-words text-ink">{i.text}</p>
                      {i.rejectionReason ? <p className="text-sm text-muted">{t("reason", { reason: t(`reasons.${i.rejectionReason}`) })}</p> : null}
                      {canModerate(i.status) ? (
                        <IntlScope namespaces={["admin"]}>
                          <ModerationActions reviewId={i.reviewId} reference={i.bookingReference} version={i.version} decide={decideReviewAction} />
                        </IntlScope>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        );
      }}
    </AdminRouteGate>
  );
}

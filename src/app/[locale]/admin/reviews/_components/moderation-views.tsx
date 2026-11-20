import { ArrowLeft, History, Star } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AccessDenied } from "@/components/admin/ops/states";
import { cn } from "@/components/ui/cn";
import { GateNotice } from "@/components/shared/gate-notice";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { RetryAction } from "@/components/shared/retry-action";
import { KeyedStatusBadge } from "@/components/shared/status-badge";
import { Link } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import { canModerate, describeReviewStatus, MODERATION_FILTERS, type ModerationFilter, type ModerationItem, type ModerationLogEntry, type ModerationPage } from "@/modules/reviews";
import { ModerationPager } from "./moderation-pager";

const IST = { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" } as const;
export type DoneNotice = "published" | "rejected" | "conflict" | null;

/**
 * Error states shared by both moderation pages. `gated` = no backend contract yet (honest notice),
 * `forbidden` = the server refused this principal (same denied view as the route gate), anything
 * else = inline error with retry. `unauthenticated` never reaches here: the route gate redirects.
 */
function FailureState({ code, gatedText }: { code: string; gatedText: string }) {
  if (code === "gated") return <GateNotice reason="contract_pending">{gatedText}</GateNotice>;
  if (code === "forbidden") return <AccessDenied headingLevel="h2" />;
  return <InlineError code={code} action={<RetryAction />} />;
}

/** Pending/published/rejected queue (capability `review:moderate`). No patient identity, no ids in URLs. */
export function ModerationQueueView({
  result,
  filter,
  cursor,
  done,
  listHref,
  renderActions,
}: {
  result: ApiResult<ModerationPage<ModerationItem>>;
  filter: ModerationFilter;
  cursor?: string;
  done: DoneNotice;
  listHref: (cursor?: string) => string;
  /** Publish / do-not-publish controls for one pending item (a client island from the page). */
  renderActions: (item: ModerationItem) => ReactNode;
}) {
  const t = useTranslations("admin.reviews");
  const format = useFormatter();
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
  if (!result.ok) {
    return (
      <div className="grid gap-8">
        {header}
        <FailureState code={result.error.code} gatedText={t("gated")} />
      </div>
    );
  }
  const { items, nextCursor } = result.data;
  const paged = Boolean(cursor || nextCursor);
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
          {t(`filter.${filter}`)}: {paged ? t("countPage", { count: items.length }) : t("count", { count: items.length })}
        </h2>
        {items.length === 0 && !cursor ? (
          <p className="text-muted">{t(`empty.${filter}`)}</p>
        ) : (
          <ul className="grid gap-3">
            {items.map((i) => (
              <li key={i.reviewId} className="grid gap-3 rounded-lg border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid min-w-0 gap-0.5">
                    <p className="font-semibold break-words text-ink">{t("item", { provider: i.providerDisplayName, reference: i.bookingReference })}</p>
                    <p className="text-sm text-muted tabular">{t("submitted", { date: format.dateTime(new Date(i.submittedAt), IST) })}</p>
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
                {canModerate(i.status) ? renderActions(i) : null}
              </li>
            ))}
          </ul>
        )}
        <ModerationPager
          label={t("pager.label")}
          firstHref={cursor ? listHref() : null}
          nextHref={nextCursor ? listHref(nextCursor) : null}
          text={{ first: t("pager.first"), next: t("pager.next"), end: t("pager.end") }}
        />
      </section>
    </div>
  );
}

/**
 * Read-only decision log, newest first. No undo and no other controls. Rows show the booking
 * reference, provider, outcome, reason and time; never the patient, the review text or another
 * moderator's identity.
 */
export function DecisionLogView({ result, cursor, logHref }: { result: ApiResult<ModerationPage<ModerationLogEntry>>; cursor?: string; logHref: (cursor?: string) => string }) {
  const t = useTranslations("admin.reviews.log");
  const tr = useTranslations("admin.reviews");
  const format = useFormatter();
  const header = (
    <PageHeader
      title={t("title")}
      description={t("description")}
      breadcrumb={
        <Link
          href="/admin/reviews"
          className="inline-flex min-h-target w-fit items-center gap-2 font-semibold text-forest underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("back")}
        </Link>
      }
    />
  );
  if (!result.ok) {
    return (
      <div className="grid gap-8">
        {header}
        <FailureState code={result.error.code} gatedText={t("gated")} />
      </div>
    );
  }
  const { items: entries, nextCursor } = result.data;
  const paged = Boolean(cursor || nextCursor);
  return (
    <div className="grid gap-8">
      {header}
      <section aria-labelledby="moderation-log" className="grid gap-4">
        <h2 id="moderation-log" className="text-lg font-semibold text-ink">
          {paged ? t("countPage", { count: entries.length }) : t("count", { count: entries.length })}
        </h2>
        {entries.length === 0 && !cursor ? (
          <p className="text-muted">{t("empty")}</p>
        ) : (
          <ol className="grid gap-3">
            {entries.map((e) => (
              <li key={e.entryId} className="grid gap-2 rounded-lg border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="min-w-0 font-semibold break-words text-ink">{tr("item", { provider: e.providerDisplayName, reference: e.bookingReference })}</p>
                  <KeyedStatusBadge presentation={describeReviewStatus(e.outcome)} />
                </div>
                {e.reason ? <p className="text-sm text-ink">{tr("reason", { reason: tr(`reasons.${e.reason}`) })}</p> : null}
                <p className="text-sm text-muted tabular">
                  <time dateTime={e.decidedAt}>{format.dateTime(new Date(e.decidedAt), IST)}</time>
                  {" · "}
                  {e.decidedBySelf ? t("bySelf") : t("byOther")}
                </p>
              </li>
            ))}
          </ol>
        )}
        <ModerationPager
          label={tr("pager.label")}
          firstHref={cursor ? logHref() : null}
          nextHref={nextCursor ? logHref(nextCursor) : null}
          text={{ first: tr("pager.first"), next: tr("pager.next"), end: t("end") }}
        />
      </section>
    </div>
  );
}

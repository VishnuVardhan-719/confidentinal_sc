import { ArrowLeft } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { AdminRouteGate } from "@/components/admin/admin-frame";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { GateNotice } from "@/components/shared/gate-notice";
import { InlineError } from "@/components/shared/inline-error";
import { PageHeader } from "@/components/shared/page-header";
import { RetryAction } from "@/components/shared/retry-action";
import { KeyedStatusBadge } from "@/components/shared/status-badge";
import { Link } from "@/i18n/navigation";
import { fail } from "@/lib/api/result";
import { can } from "@/modules/admin/capabilities";
import { describeReviewStatus, getReviewModerationApi } from "@/modules/reviews";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("admin.reviews.log"))("title"));
}

/**
 * Read-only moderation decision log (capability `review:moderate`), newest first. No undo and no
 * other controls: a declined patient can edit and resubmit, which starts a new review cycle.
 * Rows show the booking reference, provider, outcome, reason and time; never the patient, the
 * review text or another moderator's identity.
 */
export default async function ModerationLogPage() {
  return (
    <AdminRouteGate route="reviews" subPath="log">
      {async (ctx) => {
        const [t, tr, format] = await Promise.all([getTranslations("admin.reviews.log"), getTranslations("admin.reviews"), getFormatter()]);
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
        const result = await getReviewModerationApi(process.env, can(ctx.principal, "review:moderate"), ctx.principal.profileId)
          .listDecisions()
          .catch(() => fail("unavailable"));
        if (!result.ok) {
          return (
            <div className="grid gap-8">
              {header}
              {result.error.code === "gated" ? <GateNotice reason="contract_pending">{t("gated")}</GateNotice> : <InlineError code={result.error.code} action={<RetryAction />} />}
            </div>
          );
        }
        const entries = result.data;
        return (
          <div className="grid gap-8">
            {header}
            <section aria-labelledby="moderation-log" className="grid gap-4">
              <h2 id="moderation-log" className="text-lg font-semibold text-ink">
                {t("count", { count: entries.length })}
              </h2>
              {entries.length === 0 ? (
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
                        <time dateTime={e.decidedAt}>{format.dateTime(new Date(e.decidedAt), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</time>
                        {" · "}
                        {e.decidedBySelf ? t("bySelf") : t("byOther")}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        );
      }}
    </AdminRouteGate>
  );
}

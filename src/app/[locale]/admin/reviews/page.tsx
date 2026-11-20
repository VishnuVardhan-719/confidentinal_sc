import { getTranslations } from "next-intl/server";
import { AdminRouteGate } from "@/components/admin/admin-frame";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { IntlScope } from "@/components/shared/intl-scope";
import { redirect } from "@/i18n/navigation";
import { fail } from "@/lib/api/result";
import { can } from "@/modules/admin/capabilities";
import { getReviewModerationApi, MODERATION_PAGE_SIZE, parseModerationCursor, parseModerationFilter } from "@/modules/reviews";
import { decideReviewAction } from "./actions";
import { ModerationActions } from "./_components/moderation-actions";
import { ModerationQueueView, type DoneNotice } from "./_components/moderation-views";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("admin.nav"))("reviews"));
}

const DONE = { published: "published", rejected: "rejected", conflict: "conflict" } as const;

/**
 * Review moderation queue (capability `review:moderate`). Shows the booking reference, provider,
 * rating and text only; no patient identity, and no review id in the URL (filter and an opaque
 * cursor only). The route gate handles signed out and permission denied; `ModerationQueueView`
 * renders the empty, gated, forbidden and error states. Loading and thrown errors use the admin
 * area's loading.tsx and error.tsx.
 */
export default async function ReviewModerationPage({ searchParams }: PageProps<"/[locale]/admin/reviews">) {
  const sp = await searchParams;
  const filter = parseModerationFilter(sp.status);
  const done: DoneNotice = typeof sp.done === "string" && sp.done in DONE ? DONE[sp.done as keyof typeof DONE] : null;
  // Opaque server cursor (no ids); anything malformed is ignored and the first page is shown.
  const cursor = parseModerationCursor(sp.cursor);
  const listHref = (c?: string) => `/admin/reviews?status=${filter}${c ? `&cursor=${c}` : ""}`;

  return (
    <AdminRouteGate route="reviews">
      {async (ctx, locale) => {
        const result = await getReviewModerationApi(process.env, can(ctx.principal, "review:moderate"))
          .listQueue(filter, { limit: MODERATION_PAGE_SIZE, ...(cursor ? { cursor } : {}) })
          .catch(() => fail("unavailable"));
        // A cursor the server no longer accepts (foreign or expired): start again from the first page.
        if (!result.ok && result.error.code === "validation" && cursor) redirect({ href: listHref(), locale });
        return (
          <ModerationQueueView
            result={result}
            filter={filter}
            cursor={cursor}
            done={done}
            listHref={listHref}
            renderActions={(i) => (
              <IntlScope namespaces={["admin"]}>
                <ModerationActions reviewId={i.reviewId} reference={i.bookingReference} version={i.version} decide={decideReviewAction} />
              </IntlScope>
            )}
          />
        );
      }}
    </AdminRouteGate>
  );
}

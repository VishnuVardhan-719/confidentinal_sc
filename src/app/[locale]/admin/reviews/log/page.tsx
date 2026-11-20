import { getTranslations } from "next-intl/server";
import { AdminRouteGate } from "@/components/admin/admin-frame";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { redirect } from "@/i18n/navigation";
import { fail } from "@/lib/api/result";
import { can } from "@/modules/admin/capabilities";
import { getReviewModerationApi, MODERATION_PAGE_SIZE, parseModerationCursor } from "@/modules/reviews";
import { DecisionLogView } from "../_components/moderation-views";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("admin.reviews.log"))("title"));
}

/**
 * Read-only moderation decision log (capability `review:moderate`), newest first. The route gate
 * handles signed out (login with this page as `next`) and permission denied; `DecisionLogView`
 * renders the empty, gated, forbidden and error states. Loading and thrown errors use the admin
 * area's loading.tsx and error.tsx.
 */
export default async function ModerationLogPage({ searchParams }: PageProps<"/[locale]/admin/reviews/log">) {
  // Opaque server cursor (no ids); anything malformed is ignored and the first page is shown.
  const cursor = parseModerationCursor((await searchParams).cursor);
  const logHref = (c?: string) => (c ? `/admin/reviews/log?cursor=${c}` : "/admin/reviews/log");
  return (
    <AdminRouteGate route="reviews" subPath="log">
      {async (ctx, locale) => {
        const result = await getReviewModerationApi(process.env, can(ctx.principal, "review:moderate"), ctx.principal.profileId)
          .listDecisions({ limit: MODERATION_PAGE_SIZE, ...(cursor ? { cursor } : {}) })
          .catch(() => fail("unavailable"));
        // A cursor the server no longer accepts: start again from the newest decisions.
        if (!result.ok && result.error.code === "validation" && cursor) redirect({ href: logHref(), locale });
        return <DecisionLogView result={result} cursor={cursor} logHref={logHref} />;
      }}
    </AdminRouteGate>
  );
}

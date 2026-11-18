import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/auth/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { RetryAction } from "@/components/shared/retry-action";
import type { AdminLoad } from "@/modules/verification/flows";

/** Gated / not found / denied / error states for admin verification loaders. */
export async function AdminLoadState({ state }: { state: Exclude<AdminLoad<unknown>, { kind: "ready" }> }) {
  const t = await getTranslations("onboarding");
  switch (state.kind) {
    case "gated":
      return (
        <Notice tone="neutral" icon="lock" title={t("load.gatedTitle")}>
          {t("load.gatedBody")}
        </Notice>
      );
    case "not_found":
      return <EmptyState title={t("adminReview.detail.notFoundTitle")} description={t("adminReview.detail.notFoundBody")} />;
    case "forbidden":
      return <AccessDenied reason="forbidden" />;
    case "error":
      return <InlineError code="generic" action={<RetryAction />} />;
  }
}

import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/auth/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { RetryAction } from "@/components/shared/retry-action";
import type { LoadFailure } from "@/modules/onboarding/loaders";

/** Maps a loader failure to the gated / not found / denied / error page states. */
export async function PatientLoadState({ state }: { state: LoadFailure }) {
  const t = await getTranslations("onboarding.load");
  switch (state.kind) {
    case "gated":
      return (
        <Notice tone="neutral" icon="lock" title={t("gatedTitle")}>
          {t("gatedBody")}
        </Notice>
      );
    case "not_found":
      return <EmptyState title={t("notFoundTitle")} description={t("notFoundBody")} />;
    case "forbidden":
      return <AccessDenied reason="forbidden" />;
    case "error":
      return <InlineError code={state.code} action={<RetryAction />} />;
  }
}

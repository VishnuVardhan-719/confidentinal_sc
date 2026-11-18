import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { GateNotice } from "@/components/shared/gate-notice";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { RetryAction } from "@/components/shared/retry-action";
import type { PageState } from "@/modules/doctor/routing";

/**
 * Renders every non-ready PageState with the shared components. `empty` needs caller copy.
 * Denied and not-found deliberately say the same thing whether or not the resource exists.
 */
export async function PageStateView<T>({
  state,
  empty,
  gateBody,
  headingLevel = "h2",
}: {
  state: Exclude<PageState<T>, { kind: "ready" }>;
  empty?: { title: string; description?: ReactNode; action?: ReactNode };
  gateBody?: ReactNode;
  headingLevel?: "h2" | "h3";
}) {
  const t = await getTranslations("doctor.common");
  switch (state.kind) {
    case "empty":
      return <EmptyState title={empty?.title ?? t("notFound")} description={empty?.description} action={empty?.action} headingLevel={headingLevel} />;
    case "gated":
      return <GateNotice feature="clinical">{gateBody}</GateNotice>;
    case "denied":
      return <Notice tone="neutral" icon="lock" title={t("denied")} />;
    case "not_found":
      return <Notice tone="neutral" title={t("notFound")} />;
    case "unauthenticated":
      return <InlineError code="unauthenticated" />;
    case "error":
      return <InlineError code={state.code} action={state.retryable ? <RetryAction /> : undefined} />;
  }
}

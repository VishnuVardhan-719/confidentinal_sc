import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { GateNotice } from "@/components/shared/gate-notice";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { RetryAction } from "@/components/shared/retry-action";
import type { FeatureFlag } from "@/lib/feature-flags";
import type { LoaderResult } from "@/modules/admin/access";

/** Shown when the server guard or API refuses access. Hiding UI is never the only guard. */
export function AccessDenied({ headingLevel = "h1" }: { headingLevel?: "h1" | "h2" }) {
  const t = useTranslations("admin.ops.denied");
  const Heading = headingLevel;
  return (
    <section aria-labelledby="ops-denied-title" className="grid max-w-2xl gap-3 rounded-lg border border-border bg-surface p-6">
      <Heading id="ops-denied-title" className="font-display text-2xl font-medium text-ink">
        {t("title")}
      </Heading>
      <p className="measure text-base text-muted">{t("body")}</p>
    </section>
  );
}

/** Honest "not connected" panel for screens whose backend contract does not exist yet. */
export function NotConnected({ title, body }: { title?: string; body?: string }) {
  const t = useTranslations("admin.ops.gated");
  return (
    <Notice tone="neutral" icon="lock" title={title ?? t("title")} data-not-connected="">
      {body ?? t("body")}
    </Notice>
  );
}

export type EmptyCopy = { title: string; description?: ReactNode; action?: ReactNode };

/**
 * Renders every non-data state of a LoaderResult and the fixture notice, then
 * hands real data to `children`. Errors never render as empty or zero.
 */
export function LoaderState<T>({
  result,
  empty,
  gateFeature,
  children,
}: {
  result: LoaderResult<T>;
  empty: EmptyCopy;
  /** When the gate is a feature flag, show the shared GateNotice for it. */
  gateFeature?: FeatureFlag;
  children: (data: T) => ReactNode;
}) {
  const t = useTranslations("admin.ops");
  switch (result.status) {
    case "ok":
      return (
        <div className="grid gap-6">
          {result.fixture ? <FixtureNotice /> : null}
          {children(result.data)}
        </div>
      );
    case "empty":
      return (
        <div className="grid gap-6">
          {result.fixture ? <FixtureNotice /> : null}
          <EmptyState title={empty.title} description={empty.description} action={empty.action} />
        </div>
      );
    case "denied":
      return <AccessDenied headingLevel="h2" />;
    case "not_found":
      return <EmptyState icon="search" title={t("notFound.title")} description={t("notFound.body")} />;
    case "gated":
      return gateFeature ? <GateNotice feature={gateFeature} /> : <NotConnected />;
    case "unauthenticated":
      return <Notice tone="warning" title={t("unauthenticated.title")}>{t("unauthenticated.body")}</Notice>;
    case "error":
      return <InlineError code={result.code} action={<RetryAction />} />;
  }
}

import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import type { StatusPresentation } from "@/components/shared/status";
import type { ViewState } from "@/components/shared/view-state";
import { ViewStateFallback } from "@/components/shared/view-state-fallback";
import { cn } from "@/components/ui/cn";
import { formatPaise } from "./money";
import { PaymentStatus } from "./payment-status";

export type PaymentMethod = "pay_after" | "online_test";

/** View model for PaymentSummary. Amounts are server-derived integer paise. */
export type PaymentSummaryView = {
  statusPresentation: StatusPresentation;
  /** Snapshotted price lines at request time, e.g. consultation fee, sample collection. */
  lines?: { label: string; amountPaise: number }[];
  amountDuePaise: number;
  collectedPaise: number;
  refundedPaise: number;
  method: PaymentMethod | null;
  /** True for fixture data; shows <FixtureNotice/>. */
  synthetic: boolean;
};

const METHOD_KEYS = { pay_after: "payAfter", online_test: "onlineTest" } as const;

/**
 * Price and payment state for one booking. Server component.
 * - "Collected" is only what the server recorded; an amount due is never shown as received.
 * - Pay-after (provider collects) is explained as distinct from an online payment.
 * - Invalid amounts render as "amount unavailable", never as ₹0.
 */
export function PaymentSummary({ view, headingLevel = "h2", className }: { view: ViewState<PaymentSummaryView>; headingLevel?: "h2" | "h3"; className?: string }) {
  const t = useTranslations("payment.summary");
  const Heading = headingLevel;
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={cn("grid gap-4 rounded-lg border border-border bg-surface p-5 sm:p-6", className)}>
      <Heading id={titleId} className="text-lg font-semibold text-ink">
        {t("title")}
      </Heading>
      <ViewStateFallback view={view} loadingVariant="detail">
        {(data) => <SummaryBody data={data} />}
      </ViewStateFallback>
    </section>
  );
}

function SummaryBody({ data }: { data: PaymentSummaryView }) {
  const t = useTranslations("payment.summary");
  const locale = useLocale();
  const money = (paise: number) => formatPaise(paise, locale) ?? t("amountUnavailable");

  return (
    <div className="grid gap-4">
      {data.synthetic ? <FixtureNotice /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">{t("statusLabel")}</span>
        <PaymentStatus presentation={data.statusPresentation} />
      </div>
      <dl className="grid divide-y divide-border border-y border-border tabular">
        {(data.lines ?? []).map((line, i) => (
          <Row key={`${line.label}-${i}`} term={line.label} value={money(line.amountPaise)} />
        ))}
        <Row term={t("due")} value={money(data.amountDuePaise)} strong />
        <Row term={data.method === "pay_after" ? t("collectedByProvider") : t("collected")} value={money(data.collectedPaise)} />
        {data.refundedPaise > 0 ? <Row term={t("refunded")} value={money(data.refundedPaise)} /> : null}
      </dl>
      <p className="text-sm text-muted">{data.method ? t(`method.${METHOD_KEYS[data.method]}`) : t("method.none")}</p>
      <p className="text-sm text-muted">{t("separateNote")}</p>
    </div>
  );
}

function Row({ term, value, strong = false }: { term: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className={strong ? "font-semibold text-ink" : "text-ink"}>{term}</dt>
      <dd className={strong ? "text-lg font-semibold text-ink" : "text-ink"}>{value}</dd>
    </div>
  );
}

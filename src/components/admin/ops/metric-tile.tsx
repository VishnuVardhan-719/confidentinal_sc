import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Metric } from "@/modules/admin/access";
import { useLocale } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { formatNumber } from "./format";

/**
 * A dashboard number from real data only. "Unavailable" when the source failed
 * or is not connected; "N+" when more pages exist. Never a placeholder zero.
 */
export function MetricTile({ label, metric, href, testId }: { label: string; metric: Metric; href?: string; testId?: string }) {
  const t = useTranslations("admin.ops.metric");
  const locale = useLocale() as AppLocale;
  const value =
    metric.kind === "value"
      ? metric.lowerBound
        ? t("lowerBound", { count: formatNumber(metric.value, locale) })
        : formatNumber(metric.value, locale)
      : t(metric.reason);
  const body = (
    <>
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd data-testid={testId} className={metric.kind === "value" ? "font-display text-3xl font-medium text-ink tabular" : "text-base font-medium text-muted"}>
        {value}
      </dd>
    </>
  );
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      {href ? (
        <Link href={href} className="grid min-h-target gap-1 rounded-md focus-visible:outline-2 focus-visible:outline-focus">
          <dl className="grid gap-1">{body}</dl>
        </Link>
      ) : (
        <dl className="grid gap-1">{body}</dl>
      )}
    </div>
  );
}

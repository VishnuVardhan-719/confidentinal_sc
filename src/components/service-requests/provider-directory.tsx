import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import { formatPaise, type Locale } from "@/lib/format";
import { LinkAction } from "./link-action";
import type { BaseProvider } from "@/modules/service-requests/core";

/**
 * Provider list with a PIN filter. The filter is a plain GET form, so it works without JavaScript and the
 * PIN (a public area code, not patient data) is the only thing in the URL. Only providers that list the PIN
 * in their own service area are shown for it.
 */
export async function ProviderDirectory<P extends BaseProvider>({ segment, result, pin, pinInvalid, requestLabel, fromPaise, meta }: {
  segment: string; result: ApiResult<{ items: P[] }>; pin: string | null; pinInvalid: boolean; requestLabel: string;
  fromPaise: (provider: P) => number; meta: (provider: P) => ReactNode;
}) {
  const t = await getTranslations("services.common");
  const locale = (await getLocale()) as Locale;
  const items = result.ok ? result.data.items : [];
  return (
    <div className="grid gap-6">
      <form method="get" role="search" aria-label={t("filterLabel")} className="grid gap-2 rounded-lg border border-border bg-surface p-5 sm:p-6">
        <label htmlFor="provider-pin" className="text-base font-semibold text-ink">{t("pinLabel")}</label>
        <p id="provider-pin-hint" className="text-sm text-muted">{t("pinHint")}</p>
        {pinInvalid ? <InlineError id="provider-pin-error" message={t("pinError")} /> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Input id="provider-pin" name="pin" defaultValue={pin ?? ""} inputMode="numeric" maxLength={6} autoComplete="postal-code" className="w-40"
            aria-describedby={pinInvalid ? "provider-pin-error provider-pin-hint" : "provider-pin-hint"} aria-invalid={pinInvalid || undefined} />
          <Button type="submit">{t("search")}</Button>
          {pin || pinInvalid ? <Button asChild variant="quiet"><Link href={segment}>{t("showAll")}</Link></Button> : null}
        </div>
      </form>

      {!result.ok ? (
        result.error.code === "gated"
          ? <Notice tone="neutral" title={t("notConnectedTitle")} action={<LinkAction href="/patient/dashboard">{t("toDashboard")}</LinkAction>}>{t("notConnectedBody")}</Notice>
          : <InlineError code={result.error.code} action={<><LinkAction href={pin ? `${segment}?pin=${pin}` : segment}>{t("form.retry")}</LinkAction><LinkAction href="/patient/dashboard" variant="quiet">{t("toDashboard")}</LinkAction></>} />
      ) : (
        <section aria-labelledby="provider-results" className="grid gap-4">
          <h2 id="provider-results" className="text-lg font-semibold text-ink" aria-live="polite">
            {pin ? t("resultsIn", { count: items.length, pin }) : t("results", { count: items.length })}
          </h2>
          {items.length === 0 ? (
            <Notice tone="neutral" title={t("emptyTitle")} action={<Button asChild variant="secondary"><Link href={segment}>{t("showAll")}</Link></Button>}>{t("emptyBody")}</Notice>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {items.map(provider => (
                <li key={provider.id} data-testid="service-provider-card" className="grid content-between gap-4 rounded-lg border border-border bg-surface p-5">
                  <div className="grid gap-2">
                    <h3 className="font-display text-xl font-medium text-ink">{provider.name}</h3>
                    <p className="text-sm text-muted">{provider.area.locality}, {provider.area.city}</p>
                    <p className="text-sm text-muted tabular">{t("serves", { pins: provider.area.pins.join(", ") })}</p>
                    {meta(provider)}
                    <p className="text-base font-semibold text-ink tabular">{t("from", { price: formatPaise(fromPaise(provider), locale) })}</p>
                  </div>
                  <div>
                    <Button asChild><Link href={`${segment}/request?providerId=${provider.id}`} aria-label={`${requestLabel}: ${provider.name}`}>{requestLabel}</Link></Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted">{t("manual")}</p>
        </section>
      )}
    </div>
  );
}

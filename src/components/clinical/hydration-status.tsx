"use client";

import { useTranslations } from "next-intl";

/**
 * Companion to useHydrated (ADVERSARIAL_REVIEW D4). While the controls are disabled until hydration,
 * the surrounding form or panel sets `aria-busy` (hydrationBusy) and this visually hidden status
 * says "Please wait.", so a screen reader user hears why the fields are unavailable instead of
 * a bare "dimmed". It empties once React owns the page.
 */
export function HydrationStatus({ hydrated }: { hydrated: boolean }) {
  const t = useTranslations("common.actions");
  return (
    <p role="status" className="sr-only" data-hydration-status>
      {hydrated ? "" : t("working")}
    </p>
  );
}

/** Spread on the form or panel root: `aria-busy` only while not hydrated. */
export const hydrationBusy = (hydrated: boolean) => ({ "aria-busy": hydrated ? undefined : (true as const) });

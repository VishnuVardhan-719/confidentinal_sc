"use client";

import { ArrowLeft, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export type ServiceArea = "book" | "lab" | "care" | "ambulance";
const HOME: Record<ServiceArea, string> = { book: "/doctors", lab: "/patient/lab-tests", care: "/patient/caretakers", ambulance: "/patient/ambulance" };

/**
 * Error boundary body for the patient booking and service-request routes. Never shows the raw error (only the
 * opaque digest for support), offers Try again and a way back to the list, and on ambulance pages keeps the
 * 112 call link first. Needs the `services` messages (the route layout provides them).
 */
export function ServiceRouteError({ area, error, retry }: { area: ServiceArea; error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("services.errorPage");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <div className="mx-auto grid w-full max-w-form gap-4 py-8" data-testid="route-error">
      {area === "ambulance" ? (
        <Notice tone="danger" title={t("emergency")} action={<Button asChild variant="danger"><a href="tel:112"><Phone aria-hidden />112</a></Button>} />
      ) : null}
      <h1 ref={heading} tabIndex={-1} className="font-display text-3xl font-medium text-ink focus:outline-none">{t("title")}</h1>
      <p className="text-lg text-muted">{t("body")}</p>
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => retry()}>{t("retry")}</Button>
        <Button asChild variant="secondary"><Link href={HOME[area]}><ArrowLeft aria-hidden />{t(`back.${area}`)}</Link></Button>
      </div>
      {error.digest ? <p className="text-sm text-muted tabular">{t("reference", { digest: error.digest })}</p> : null}
    </div>
  );
}

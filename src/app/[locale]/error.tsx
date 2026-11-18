"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/shared/brand-logo";
import { MAIN_CONTENT_ID } from "@/components/shared/skip-link";
import { Link } from "@/i18n/navigation";

/** Route error boundary. Never shows the raw error message; only the opaque digest for support. */
export default function LocaleError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("errors.boundary");
  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-content items-center px-4 sm:px-6 lg:px-8">
          <BrandLogo />
        </div>
      </header>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="mx-auto grid w-full max-w-content flex-1 content-center gap-6 px-4 py-20 outline-none sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-medium text-ink">{t("title")}</h1>
        <p className="measure text-lg text-muted">{t("body")}</p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => retry()}>{t("retry")}</Button>
          <Button asChild variant="secondary">
            <Link href="/">{t("home")}</Link>
          </Button>
        </div>
        {error.digest ? <p className="text-sm text-muted tabular">{t("reference", { digest: error.digest })}</p> : null}
      </main>
    </>
  );
}

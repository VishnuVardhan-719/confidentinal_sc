"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/shared/notice";
import { Link } from "@/i18n/navigation";

/**
 * Patient route error boundary: friendly localized copy, a retry and a way out. Never renders the raw
 * error message or stack, only the opaque digest for support.
 */
export function PatientRouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("errors.boundary");
  return (
    <div className="mx-auto grid w-full max-w-form gap-4 px-4 py-10">
      <Notice
        tone="danger"
        title={t("title")}
        action={
          <>
            <Button onClick={() => retry()}>{t("retry")}</Button>
            <Button asChild variant="secondary">
              <Link href="/">{t("home")}</Link>
            </Button>
          </>
        }
      >
        {t("body")}
      </Notice>
      {error.digest ? <p className="text-sm text-muted tabular">{t("reference", { digest: error.digest })}</p> : null}
    </div>
  );
}

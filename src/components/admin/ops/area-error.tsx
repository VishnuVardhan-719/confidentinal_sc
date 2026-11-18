"use client";

import { useTranslations } from "next-intl";
import { InlineError } from "@/components/shared/inline-error";
import { Button } from "@/components/ui/button";

/** Route error boundary content inside an area shell. Never shows the raw error; only the digest. */
export function AreaError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("errors.boundary");
  return (
    <div className="grid max-w-2xl gap-4">
      <h1 className="font-display text-2xl font-medium text-ink">{t("title")}</h1>
      <InlineError message={t("body")} action={<Button onClick={() => retry()}>{t("retry")}</Button>} />
      {error.digest ? <p className="text-sm text-muted tabular">{t("reference", { digest: error.digest })}</p> : null}
    </div>
  );
}

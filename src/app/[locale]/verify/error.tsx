"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/shared/notice";

/** Proof check error boundary: never renders the raw error, only the opaque digest. */
export default function VerifyError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("errors.boundary");
  return (
    <div className="mx-auto grid max-w-form gap-4 px-4 py-10">
      <Notice tone="danger" title={t("title")} action={<Button onClick={() => retry()}>{t("retry")}</Button>}>
        {t("body")}
      </Notice>
      {error.digest ? <p className="text-sm text-muted tabular">{t("reference", { digest: error.digest })}</p> : null}
    </div>
  );
}

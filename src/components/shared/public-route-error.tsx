"use client";

import { useTranslations } from "next-intl";
import { Container } from "@/components/public/layout";
import { InlineError } from "@/components/shared/inline-error";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * Error boundary content for public and sign-in pages, rendered inside the segment's own
 * header/main/footer. Never shows the raw error message; only the opaque digest for support.
 */
export function PublicRouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("errors.boundary");
  return (
    <Container className="grid max-w-2xl gap-4 py-12 md:py-20">
      <h1 className="font-display text-3xl font-medium text-ink">{t("title")}</h1>
      <InlineError message={t("body")} action={<Button onClick={() => retry()}>{t("retry")}</Button>} />
      <p>
        <Link href="/" className="font-semibold text-forest underline underline-offset-4">
          {t("home")}
        </Link>
      </p>
      {error.digest ? <p className="text-sm text-muted tabular">{t("reference", { digest: error.digest })}</p> : null}
    </Container>
  );
}
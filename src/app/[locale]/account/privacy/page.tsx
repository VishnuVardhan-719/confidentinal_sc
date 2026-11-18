import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AccessDenied } from "@/components/auth/access-denied";
import { AccountNav } from "@/components/auth/account-nav";
import { PageLoading } from "@/components/auth/page-loading";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireSession } from "@/modules/auth/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.account");
  return { title: t("privacyMetaTitle"), robots: { index: false, follow: false } };
}

export default function AccountPrivacyPage() {
  return (
    <Suspense fallback={<PageLoading variant="detail" />}>
      <AccountPrivacy />
    </Suspense>
  );
}

/**
 * Privacy controls. No export/deletion button: those follow approved retention and governance
 * (FRONTEND_MASTER s19), which are not published yet, so the page routes requests to support.
 */
async function AccountPrivacy() {
  const locale = await getLocale();
  const access = await requireSession({ locale, path: `/${locale}/account/privacy` });
  if (access.kind === "denied") return <AccessDenied reason={access.reason} />;
  const t = await getTranslations("auth.account");

  return (
    <div className="grid max-w-form gap-8">
      <PageHeader title={t("privacyTitle")} description={t("privacyLead")} />
      <AccountNav current="privacy" />
      <Notice tone="neutral" icon="lock" title={t("consentTitle")}>
        {t("consentBody")}
      </Notice>
      <section aria-labelledby="export-title" className="grid gap-3">
        <h2 id="export-title" className="text-xl font-semibold text-ink">
          {t("exportTitle")}
        </h2>
        <p className="measure text-base text-muted">{t("exportBody")}</p>
        <Button asChild variant="secondary" className="w-fit">
          <Link href="/contact">{t("contact")}</Link>
        </Button>
      </section>
    </div>
  );
}

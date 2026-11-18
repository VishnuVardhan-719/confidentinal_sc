import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AccessDenied } from "@/components/auth/access-denied";
import { AccountNav } from "@/components/auth/account-nav";
import { PageLoading } from "@/components/auth/page-loading";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { isFixtureAdapter, requireSession } from "@/modules/auth/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.account");
  return { title: t("securityMetaTitle"), robots: { index: false, follow: false } };
}

export default function AccountSecurityPage() {
  return (
    <Suspense fallback={<PageLoading variant="detail" />}>
      <AccountSecurity />
    </Suspense>
  );
}

async function AccountSecurity() {
  const locale = await getLocale();
  const access = await requireSession({ locale, path: `/${locale}/account/security` });
  if (access.kind === "denied") return <AccessDenied reason={access.reason} />;
  const t = await getTranslations("auth.account");
  const name = access.identity.displayName.trim();

  return (
    <div className="grid max-w-form gap-8">
      {isFixtureAdapter() ? <FixtureNotice /> : null}
      <PageHeader title={t("securityTitle")} description={name ? t("signedInAs", { name }) : t("signedInNoName")} />
      <AccountNav current="security" />
      <section aria-labelledby="sign-out-title" className="grid gap-3">
        <h2 id="sign-out-title" className="text-xl font-semibold text-ink">
          {t("signOutTitle")}
        </h2>
        <p className="text-base text-muted">{t("signOutBody")}</p>
        <SignOutButton locale={locale} label={t("signOut")} />
      </section>
      <Notice tone="neutral" icon="lock" title={t("otherSessionsTitle")}>
        {t("otherSessionsBody")}
      </Notice>
      <Notice tone="neutral" icon="lock" title={t("mfaTitle")}>
        {t("mfaBody")}
      </Notice>
    </div>
  );
}

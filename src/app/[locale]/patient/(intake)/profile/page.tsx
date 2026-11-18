import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccessDenied } from "@/components/auth/access-denied";
import { PageLoading } from "@/components/auth/page-loading";
import { PatientLoadState } from "@/components/onboarding/load-state";
import { ProfileGlance, ReadinessBanner } from "@/components/onboarding/profile-glance";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { PageHeader } from "@/components/shared/page-header";
import { loadPatientProfile } from "@/modules/onboarding/loaders";
import { getRequestApis, isFixtureAdapter, requireRole } from "@/modules/auth/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding.profile");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default function PatientProfilePage() {
  return (
    <Suspense fallback={<PageLoading variant="detail" />}>
      <PatientProfile />
    </Suspense>
  );
}

async function PatientProfile() {
  const locale = await getLocale();
  const access = await requireRole("patient", { locale, path: `/${locale}/patient/profile` });
  if (access.kind === "denied") return <AccessDenied reason={access.reason} />;
  const [t, { onboarding }] = await Promise.all([getTranslations("onboarding.profile"), getRequestApis()]);
  // Request-time render: age is computed from the current date.
  await connection();
  const page = await loadPatientProfile(onboarding);

  return (
    <div className="grid gap-8">
      {isFixtureAdapter() ? <FixtureNotice /> : null}
      <PageHeader title={t("title")} description={t("lead")} />
      {page.kind === "ready" ? (
        <>
          <ReadinessBanner completeness={page.completeness} />
          <ProfileGlance view={page.view} />
        </>
      ) : (
        <PatientLoadState state={page} />
      )}
    </div>
  );
}

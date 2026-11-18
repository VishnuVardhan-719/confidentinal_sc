import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccessDenied } from "@/components/auth/access-denied";
import { PageLoading } from "@/components/auth/page-loading";
import { PatientLoadState } from "@/components/onboarding/load-state";
import { ReadinessBanner } from "@/components/onboarding/profile-glance";
import { ProfileForm } from "@/components/onboarding/profile-form";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { PageHeader } from "@/components/shared/page-header";
import { loadPatientProfile } from "@/modules/onboarding/loaders";
import { PROFILE_FORM_SECTIONS, type ProfileFormSection } from "@/modules/onboarding/profile";
import { getRequestApis, isFixtureAdapter, requireRole } from "@/modules/auth/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding.profile");
  return { title: t("editMetaTitle"), robots: { index: false, follow: false } };
}

export default function HealthProfilePage() {
  return (
    <Suspense fallback={<PageLoading variant="detail" />}>
      <HealthProfile />
    </Suspense>
  );
}

async function HealthProfile() {
  const locale = await getLocale();
  const access = await requireRole("patient", { locale, path: `/${locale}/patient/health-profile` });
  if (access.kind === "denied") return <AccessDenied reason={access.reason} />;
  const [t, { onboarding }] = await Promise.all([getTranslations("onboarding.profile"), getRequestApis()]);
  // Request-time render: age is computed from the current date.
  await connection();
  const page = await loadPatientProfile(onboarding);

  return (
    <div className="grid max-w-form gap-8">
      {isFixtureAdapter() ? <FixtureNotice /> : null}
      <PageHeader
        title={t("editTitle")}
        description={t("editLead")}
        breadcrumb={<Breadcrumb items={[{ label: t("title"), href: "/patient/profile" }, { label: t("editTitle") }]} />}
      />
      {page.kind === "ready" ? (
        <>
          <ReadinessBanner completeness={page.completeness} />
          <ProfileForm
            initial={Object.fromEntries(PROFILE_FORM_SECTIONS.map((s) => [s, page.draft.sections[s]])) as Partial<Record<ProfileFormSection, unknown>>}
            version={page.draft.version}
            locale={locale}
          />
        </>
      ) : (
        <PatientLoadState state={page} />
      )}
    </div>
  );
}

import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccessDenied } from "@/components/auth/access-denied";
import { PageLoading } from "@/components/auth/page-loading";
import { withoutLocale } from "@/components/auth/paths";
import { PatientLoadState } from "@/components/onboarding/load-state";
import { PatientSubmit } from "@/components/onboarding/wizard-actions";
import { WizardForm } from "@/components/onboarding/wizard-form";
import { StillNeeded, WizardSteps } from "@/components/onboarding/wizard-steps";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getRequestApis, isFixtureAdapter, requireRole } from "@/modules/auth/server";
import { loadPatientOnboarding, patientOnboardingBase } from "@/modules/onboarding/loaders";
import { stepHref } from "@/modules/onboarding/wizard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding.patientWizard");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default function PatientOnboardingPage({ searchParams }: PageProps<"/[locale]/patient/onboarding">) {
  return (
    <Suspense fallback={<PageLoading variant="detail" />}>
      <PatientOnboarding searchParams={searchParams} />
    </Suspense>
  );
}

async function PatientOnboarding({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locale = await getLocale();
  const access = await requireRole("patient", { locale, path: `/${locale}/patient/onboarding` });
  if (access.kind === "denied") return <AccessDenied reason={access.reason} />;
  await connection();
  const [{ step }, tRoot, { onboarding }] = await Promise.all([searchParams, getTranslations(), getRequestApis()]);
  // Plain signature: keys here are computed (step labels), so skip next-intl's key-union typing.
  const t = tRoot as unknown as (key: string, values?: Record<string, string | number>) => string;
  const view = await loadPatientOnboarding(onboarding, locale, typeof step === "string" ? step : undefined);
  if (view.kind !== "ready") return <PatientLoadState state={view} />;

  const { wizard, draft, completion } = view;
  const current = wizard.current;
  const base = patientOnboardingBase(locale);
  const back = wizard.previous ? withoutLocale(stepHref(base, wizard.previous)) : null;
  const next = wizard.next ? withoutLocale(stepHref(base, wizard.next)) : null;
  const currentStep = wizard.steps.find((s) => s.current);
  const missingBeforeReview = completion.missingRequired.filter((id) => id !== "review");

  return (
    <div className="grid gap-8">
      {isFixtureAdapter() ? <FixtureNotice /> : null}
      <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="order-2 lg:order-1">
          <WizardSteps wizard={wizard} />
        </aside>
        <div className="order-1 grid max-w-form content-start gap-8 lg:order-2">
          <header className="grid gap-2">
            <p className="text-sm font-semibold text-muted">
              {t("onboarding.patientWizard.title")} · {t("onboarding.wizard.stepOf", { position: wizard.position, total: wizard.total })}
            </p>
            <h1 className="font-display text-3xl font-medium text-ink">{currentStep ? t(currentStep.labelKey as never) : null}</h1>
            <p className="text-base text-muted">{current === "review" ? t("onboarding.patientWizard.reviewLead") : t("onboarding.patientWizard.lead")}</p>
          </header>

          {current === "account" ? (
            <div className="grid gap-6">
              <Notice tone="info">{t("onboarding.wizard.accountLead")}</Notice>
              <div className="flex flex-wrap gap-3">
                {next ? (
                  <Button asChild size="lg">
                    <Link href={next}>{t("onboarding.wizard.continue")}</Link>
                  </Button>
                ) : null}
                <Button asChild variant="secondary" size="lg">
                  <Link href="/account/security">{t("onboarding.wizard.accountManage")}</Link>
                </Button>
              </div>
            </div>
          ) : current === "review" ? (
            <div className="grid gap-8">
              <StillNeeded wizard={wizard} missing={missingBeforeReview} />
              <WizardForm key={`review:${draft.version}`} mode={{ kind: "patient" }} sectionId="review" initial={draft.sections.review} version={draft.version} locale={locale} backHref={back} last />
              <PatientSubmit ready={completion.readyToSubmit} locale={locale} />
            </div>
          ) : (
            <WizardForm
              key={`${current}:${draft.version}`}
              mode={{ kind: "patient" }}
              sectionId={current}
              initial={draft.sections[current]}
              version={draft.version}
              locale={locale}
              backHref={back}
            />
          )}
          <p className="text-sm text-muted">{t("onboarding.wizard.draftNote")}</p>
        </div>
      </div>
    </div>
  );
}

import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AccessDenied } from "@/components/auth/access-denied";
import { withoutLocale } from "@/components/auth/paths";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { Notice } from "@/components/shared/notice";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { ProviderCategory } from "@/modules/auth/roles";
import { pendingApprovalPath } from "@/modules/auth/routes";
import { getRequestApis, isFixtureAdapter, requireRole } from "@/modules/auth/server";
import { loadProviderOnboarding, providerIdFor, providerOnboardingBase } from "@/modules/onboarding/loaders";
import { REQUIRED_EVIDENCE } from "@/modules/onboarding/readiness";
import { previewGroups, type FieldVisibility, type PreviewField } from "@/modules/onboarding/visibility";
import { stepHref } from "@/modules/onboarding/wizard";
import { PatientLoadState } from "./load-state";
import { providerSpec } from "./section-specs";
import { ProviderSubmit, StartApplication } from "./wizard-actions";
import { WizardForm } from "./wizard-form";
import { StillNeeded, WizardSteps, withProviderParam } from "./wizard-steps";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const VISIBILITY_ORDER: readonly FieldVisibility[] = ["public", "after_verification", "private"];

/** Label key for a saved `section.field` path, from the section spec; null when unknown. */
function fieldLabelKey(category: ProviderCategory, path: string): string | null {
  const [sectionId, name] = path.split(".");
  const spec = providerSpec(category, sectionId);
  if (!spec || spec.kind !== "fields") return null;
  return spec.fields.find((f) => f.name === name)?.labelKey ?? null;
}

/**
 * Provider onboarding for one category (doctor, lab, ambulance, caretaker): start an
 * application, edit steps while the status allows it, see what is still needed, preview what
 * patients will see, and submit for verification. Status and completeness come from the server.
 */
export async function ProviderOnboarding({ category, searchParams }: { category: ProviderCategory; searchParams: SearchParams }) {
  const locale = await getLocale();
  const base = providerOnboardingBase(locale, category);
  const access = await requireRole(category, { locale, path: base });
  if (access.kind === "denied") return <AccessDenied reason={access.reason} />;
  await connection();
  const [params, tRoot, format, { onboarding }] = await Promise.all([searchParams, getTranslations(), getFormatter(), getRequestApis()]);
  const t = tRoot as unknown as Translator;
  const step = typeof params.step === "string" ? params.step : undefined;
  const requestedProvider = typeof params.provider === "string" ? params.provider : undefined;
  const view = await loadProviderOnboarding(onboarding, category, access.workspaces, locale, step, requestedProvider);

  if (view.kind === "not_started") {
    return (
      <div className="grid gap-8">
        {isFixtureAdapter() ? <FixtureNotice /> : null}
        <h1 className="font-display text-3xl font-medium text-ink">{t(`onboarding.providerWizard.title.${category}`)}</h1>
        <p className="max-w-form text-base text-muted">{t("onboarding.providerWizard.lead")}</p>
        <StartApplication category={category} locale={locale} />
      </div>
    );
  }
  if (view.kind !== "ready") return <PatientLoadState state={view} />;

  const { wizard, draft, summary } = view;
  // Waiting for the admin: only the "request sent" message, not this editor and never a dashboard.
  if (summary.status === "submitted" || summary.status === "under_review") redirect(pendingApprovalPath(locale, category));
  const providerId = draft.providerId ?? requestedProvider ?? "";
  // Step links carry ?provider= only while the session does not list this provider yet.
  const linkProvider = providerIdFor(access.workspaces, category) ? null : providerId || null;
  const href = (stepId: string) => withoutLocale(withProviderParam(stepHref(base, stepId), linkProvider));
  const tr = t;
  const current = wizard.current;
  const currentStep = wizard.steps.find((s) => s.current);
  const statusLabel = t(summary.presentation.labelKey as never);
  const evidence = draft.evidence ?? [];
  const evidenceOptions = evidence.map((e) => ({
    documentId: e.documentId,
    kind: e.kind,
    label: `${t(`onboarding.documentKinds.${e.kind}` as never)} · ${t(`onboarding.providerWizard.evidenceStatus.${e.status}` as never)}`,
  }));

  const status = (
    <section aria-labelledby="provider-status-title" className="grid gap-4 rounded-lg border border-border bg-paper p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="provider-status-title" className="text-lg font-semibold text-ink">
          {t("onboarding.providerWizard.statusLabel")}
        </h2>
        <StatusBadge tone={summary.presentation.tone} label={statusLabel} />
      </div>
      <p className="text-base text-ink">
        {t("onboarding.providerWizard.requiredProgress", { done: summary.requiredComplete, total: summary.requiredTotal })}
      </p>
      <StillNeeded wizard={wizard} missing={summary.missingRequired} providerId={linkProvider} />
    </section>
  );

  if (!summary.canEdit) {
    return (
      <div className="grid max-w-form gap-8">
        {isFixtureAdapter() ? <FixtureNotice /> : null}
        <header className="grid gap-2">
          <h1 className="font-display text-3xl font-medium text-ink">{t(`onboarding.providerWizard.title.${category}`)}</h1>
          <p className="text-base text-muted">{t("onboarding.providerWizard.lead")}</p>
        </header>
        {status}
        <Notice tone="neutral" icon="lock" title={t("onboarding.providerWizard.lockedTitle")}>
          {t("onboarding.providerWizard.lockedBody", { status: statusLabel })}
        </Notice>
      </div>
    );
  }

  let body;
  if (current === "review") {
    const groups = previewGroups(category, draft.sections as Partial<Record<string, unknown>>);
    body = (
      <div className="grid gap-8">
        <section aria-labelledby="preview-title" className="grid gap-4">
          <h2 id="preview-title" className="text-xl font-semibold text-ink">
            {t("onboarding.providerWizard.previewTitle")}
          </h2>
          {VISIBILITY_ORDER.map((v) => (
            <PreviewGroup key={v} title={t(`onboarding.providerWizard.visibility.${v}`)} fields={groups[v]} render={(f) => previewValue(f, tr)} label={(f) => labelFor(category, f, tr)} empty={t("onboarding.providerWizard.previewEmpty")} />
          ))}
        </section>
        <ProviderSubmit ready={summary.canSubmit} locale={locale} category={category} providerId={providerId} version={draft.version} />
      </div>
    );
  } else if (current === "documents") {
    body = (
      <div className="grid gap-6">
        <p className="text-base text-ink">
          {t("onboarding.providerWizard.documentsLead", { kind: t(`onboarding.documentKinds.${REQUIRED_EVIDENCE[category]}` as never) })}
        </p>
        {evidence.length === 0 ? (
          <p className="text-base text-muted">{t("onboarding.providerWizard.documentsNone")}</p>
        ) : (
          <ul className="grid gap-2">
            {evidence.map((e) => (
              <li key={e.documentId} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
                <span className="font-semibold text-ink">{t(`onboarding.documentKinds.${e.kind}` as never)}</span>
                <span className="text-muted">{t(`onboarding.providerWizard.evidenceStatus.${e.status}` as never)}</span>
                <span className="text-sm text-muted">{t("onboarding.providerWizard.expires", { date: format.dateTime(new Date(e.expiresAt), { dateStyle: "medium" }) })}</span>
              </li>
            ))}
          </ul>
        )}
        <Notice tone="neutral" icon="lock">
          {t("onboarding.providerWizard.uploadUnavailable")}
        </Notice>
        <div className="flex flex-wrap gap-3 border-t border-border pt-6">
          {wizard.next ? (
            <Button asChild size="lg">
              <Link href={href(wizard.next)}>{t("onboarding.wizard.continue")}</Link>
            </Button>
          ) : null}
          {wizard.previous ? (
            <Button asChild variant="secondary" size="lg">
              <Link href={href(wizard.previous)}>{t("onboarding.form.back")}</Link>
            </Button>
          ) : null}
        </div>
      </div>
    );
  } else {
    body = (
      <WizardForm
        key={`${current}:${draft.version}`}
        mode={{ kind: "provider", category, providerId }}
        sectionId={current}
        initial={(draft.sections as Record<string, unknown>)[current]}
        version={draft.version}
        locale={locale}
        backHref={wizard.previous ? href(wizard.previous) : null}
        evidence={evidenceOptions}
      />
    );
  }

  return (
    <div className="grid gap-8">
      {isFixtureAdapter() ? <FixtureNotice /> : null}
      <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="order-2 lg:order-1">
          <WizardSteps wizard={wizard} providerId={linkProvider} />
        </div>
        <div className="order-1 grid max-w-form content-start gap-8 lg:order-2">
          <header className="grid gap-2">
            <p className="text-sm font-semibold text-muted">
              {t(`onboarding.providerWizard.title.${category}`)} · {t("onboarding.wizard.stepOf", { position: wizard.position, total: wizard.total })}
            </p>
            <h1 className="font-display text-3xl font-medium text-ink">{currentStep ? t(currentStep.labelKey as never) : null}</h1>
          </header>
          {summary.status === "changes_required" ? (
            <Notice tone="warning" title={t("onboarding.providerWizard.changesTitle")}>
              {t("onboarding.providerWizard.changesBody")}
            </Notice>
          ) : null}
          {status}
          {body}
          <p className="text-sm text-muted">{t("onboarding.wizard.draftNote")}</p>
        </div>
      </div>
    </div>
  );
}

/** Plain translator signature; avoids instantiating next-intl's full key union in helpers. */
type Translator = (key: string, values?: Record<string, string | number>) => string;

function labelFor(category: ProviderCategory, field: PreviewField, t: Translator): string {
  const key = fieldLabelKey(category, field.path);
  return key ? t(`onboarding.${key}`) : field.path;
}

/** Plain-text summary of a saved value. Lists show a count, never nested private detail. */
function previewValue(field: PreviewField, t: Translator): string {
  const v = field.value;
  if (typeof v === "boolean") return v ? t("onboarding.providerWizard.yes") : t("onboarding.providerWizard.no");
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.length > 160 ? `${v.slice(0, 157)}…` : v;
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x === "string" || typeof x === "number")) return v.join(", ");
    return t("onboarding.providerWizard.previewItems", { count: v.length });
  }
  return t("onboarding.providerWizard.previewItems", { count: v && typeof v === "object" ? Object.keys(v).length : 0 });
}

function PreviewGroup({
  title,
  fields,
  render,
  label,
  empty,
}: {
  title: string;
  fields: PreviewField[];
  render: (f: PreviewField) => string;
  label: (f: PreviewField) => string;
  empty: string;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-border p-4">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {fields.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <dl className="grid gap-2">
          {fields.map((f) => (
            <div key={f.path} className="grid gap-0.5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
              <dt className="text-sm text-muted">{label(f)}</dt>
              <dd className="break-words text-base text-ink">{render(f)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

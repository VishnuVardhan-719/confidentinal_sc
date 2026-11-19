import { ArrowRight, Stethoscope } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { DashboardAction } from "@/components/patient/dashboard-action";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { GateNotice } from "@/components/shared/gate-notice";
import { InlineError } from "@/components/shared/inline-error";
import { IntlScope } from "@/components/shared/intl-scope";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { RetryAction } from "@/components/shared/retry-action";
import { PatientShell } from "@/components/patient/patient-shell";
import { Link } from "@/i18n/navigation";
import { fail } from "@/lib/api/result";
import { formatPaise, type Locale } from "@/lib/format";
import { getPatientSession, patientLoginRedirect } from "@/modules/patient-dashboard/session";
import { createDoctorSearchApi } from "@/modules/providers/doctor-api";
import type { DoctorResult } from "@/modules/providers/doctor-search";
import { getSavedProvidersApi, MAX_SAVED_PROVIDERS, savedProviderSchema } from "@/modules/saved-providers";
import { saveProviderAction, unsaveProviderAction } from "./actions";
import { SaveToggle } from "./_components/save-toggle";

export async function generateMetadata() {
  const t = await getTranslations("patientAccount.saved");
  return { title: t("title"), robots: { index: false } };
}

const toLocale = (l: string): Locale => (l === "te" || l === "hi" ? l : "en");
const SUGGESTIONS = 4;

/**
 * Saved doctors. The saved list stores provider ids only; names, specialities and fees are read from
 * the public directory on every visit, so an unlisted doctor shows as "no longer listed" and can still
 * be removed. A short list of directory doctors lets the patient save without leaving the page.
 */
export default async function SavedProvidersPage({ params, searchParams }: PageProps<"/[locale]/patient/saved">) {
  const { locale: raw } = await params;
  const status = (await searchParams).status;
  const flash = status === "saved" ? "savedNow" : status === "removed" ? "removedNow" : null;
  await connection();
  const locale = toLocale(raw);
  const session = getPatientSession();
  if (session.status !== "ok") redirect(patientLoginRedirect(locale, `/${locale}/patient/saved`));

  const [t, tb] = await Promise.all([getTranslations("patientAccount.saved"), getTranslations("booking.search.specialities")]);
  const saved = await getSavedProvidersApi(process.env, session.fixtureActor).list().catch(() => fail("unavailable"));
  if (!saved.ok && saved.error.code === "unauthenticated") redirect(patientLoginRedirect(locale, `/${locale}/patient/saved`));
  const header = <PageHeader title={t("title")} description={t("description")} />;
  const shell = (children: ReactNode) => (
    <PatientShell synthetic={session.synthetic}>
      {header}
      {children}
    </PatientShell>
  );

  if (!saved.ok) {
    const code = saved.error.code;
    return shell(
      code === "gated" ? (
        <GateNotice reason="contract_pending" action={<DashboardAction />}>{t("state.gated")}</GateNotice>
      ) : code === "forbidden" ? (
        <Notice tone="neutral" icon="lock" title={t("state.denied")} action={<DashboardAction />} />
      ) : (
        <InlineError code={code} action={<RetryAction />} />
      ),
    );
  }

  const rows = saved.data.filter((r) => savedProviderSchema.safeParse(r).success);
  const doctors = createDoctorSearchApi(process.env);
  const details = await Promise.all(rows.map((r) => doctors.get(r.providerId).catch(() => fail("unavailable"))));
  const directoryDown = details.some((d) => !d.ok && d.error.code !== "not_found" && d.error.code !== "validation");
  const savedIds = new Set(rows.map((r) => r.providerId));
  const atLimit = rows.length >= MAX_SAVED_PROVIDERS;
  const search = await doctors.search({}).catch(() => fail("unavailable"));
  const suggestions = search.ok ? search.data.items.filter((d) => !savedIds.has(d.providerId)).slice(0, SUGGESTIONS) : [];

  const toggle = (providerId: string, name: string, isSaved: boolean) => (
    <SaveToggle providerId={providerId} name={name} saved={isSaved} save={saveProviderAction} unsave={unsaveProviderAction} />
  );
  const card = (d: DoctorResult, isSaved: boolean) => (
    <li key={d.providerId} className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-[auto_1fr_auto] sm:items-start">
      <span aria-hidden className="hidden size-11 items-center justify-center rounded-full bg-mist text-forest sm:inline-flex">
        <Stethoscope className="size-5" />
      </span>
      <div className="grid min-w-0 gap-0.5">
        <p className="font-semibold break-words text-ink">{d.displayName}</p>
        {d.specialities.length > 0 ? <p className="text-ink">{d.specialities.map((s) => tb(s)).join(", ")}</p> : null}
        <p className="text-sm text-muted">{d.location ? `${d.location.locality}, ${d.location.city}` : t("noLocation")}</p>
        <p className="text-sm text-muted tabular">{t("fee", { fee: formatPaise(d.feePaise, locale) })}</p>
      </div>
      <div className="flex flex-wrap items-start gap-2 sm:justify-end">
        <Button asChild variant="quiet">
          <Link href={`/doctors/${d.providerId}`} aria-label={t("viewLabel", { name: d.displayName })}>
            {t("view")}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
        {toggle(d.providerId, d.displayName, isSaved)}
      </div>
    </li>
  );

  return shell(
    <IntlScope namespaces={["patientAccount"]}>
      <div role="status" className="empty:hidden">
        {flash ? <Notice tone="info">{t(flash)}</Notice> : null}
      </div>
      {directoryDown ? <InlineError code="unavailable" action={<RetryAction />} /> : null}
      {rows.length === 0 ? (
        <EmptyState
          title={t("empty.title")}
          description={t("empty.body")}
          action={
            <Button asChild variant="secondary">
              <Link href="/doctors">{t("empty.action")}</Link>
            </Button>
          }
        />
      ) : (
        <section aria-labelledby="saved-list" className="grid gap-4">
          <h2 id="saved-list" className="text-lg font-semibold text-ink">
            {t("savedLabel", { count: rows.length })}
          </h2>
          <ul className="grid gap-3">
            {rows.map((r, i) => {
              const d = details[i];
              if (d.ok) return card(d.data, true);
              return (
                <li key={r.providerId} className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-dashed border-border-strong/60 bg-surface/60 p-4">
                  <div className="grid gap-0.5">
                    <p className="font-semibold text-ink">{t("unlistedName")}</p>
                    <p className="text-sm text-muted">{d.error.code === "not_found" || d.error.code === "validation" ? t("unlisted") : t("state.directory")}</p>
                  </div>
                  {toggle(r.providerId, t("unlistedName"), true)}
                </li>
              );
            })}
          </ul>
          {atLimit ? <p className="text-sm text-muted">{t("limit", { max: MAX_SAVED_PROVIDERS })}</p> : null}
        </section>
      )}

      {!atLimit ? (
        <section aria-labelledby="saved-suggest" className="grid gap-4 border-t border-border pt-6">
          <div className="grid gap-1">
            <h2 id="saved-suggest" className="text-lg font-semibold text-ink">
              {t("suggestLabel")}
            </h2>
            <p className="text-muted">{t("suggestBody")}</p>
          </div>
          {!search.ok ? (
            <InlineError code={search.error.code} action={<RetryAction />} />
          ) : suggestions.length === 0 ? (
            <p className="text-muted">{t("suggestEmpty")}</p>
          ) : (
            <ul className="grid gap-3">{suggestions.map((d) => card(d, false))}</ul>
          )}
        </section>
      ) : null}
    </IntlScope>,
  );
}

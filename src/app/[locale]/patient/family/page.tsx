import { Pencil, Plus, UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { DashboardAction } from "@/components/patient/dashboard-action";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { GateNotice } from "@/components/shared/gate-notice";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { RetryAction } from "@/components/shared/retry-action";
import { PatientShell } from "@/components/patient/patient-shell";
import { Link } from "@/i18n/navigation";
import { fail } from "@/lib/api/result";
import { ageOn, familyMemberSchema, MAX_FAMILY_MEMBERS, todayIst } from "@/modules/family-members";
import { familyPage, formatDob, parseFlash, redirectIfSignedOut, toLocale } from "./_lib";

export async function generateMetadata() {
  const t = await getTranslations("patientAccount.family");
  return { title: t("title"), robots: { index: false } };
}

/** Family members list: who the patient books for. Name, relation and age only; no health data. */
export default async function FamilyPage({ params, searchParams }: PageProps<"/[locale]/patient/family">) {
  const { locale: raw } = await params;
  await connection();
  const locale = toLocale(raw);
  const { api, synthetic } = await familyPage(locale);
  const [t, sp] = await Promise.all([getTranslations("patientAccount.family"), searchParams]);
  const flash = parseFlash(sp.status);
  const result = await api.list().catch(() => fail("unavailable"));
  redirectIfSignedOut(result, locale);

  const addButton = (
    <Button asChild>
      <Link href="/patient/family/new">
        <Plus aria-hidden />
        {t("add")}
      </Link>
    </Button>
  );

  if (!result.ok) {
    const code = result.error.code;
    return (
      <PatientShell synthetic={synthetic}>
        <PageHeader title={t("title")} description={t("description")} />
        {code === "gated" ? (
          <GateNotice reason="contract_pending" action={<DashboardAction />}>{t("state.gated")}</GateNotice>
        ) : code === "forbidden" ? (
          <Notice tone="neutral" icon="lock" title={t("state.denied")} action={<DashboardAction />} />
        ) : (
          <InlineError code={code} action={<RetryAction />} />
        )}
      </PatientShell>
    );
  }

  const members = result.data.filter((m) => familyMemberSchema.safeParse(m).success);
  const atLimit = members.length >= MAX_FAMILY_MEMBERS;
  const today = todayIst();

  return (
    <PatientShell synthetic={synthetic}>
      <PageHeader title={t("title")} description={t("description")} actions={members.length > 0 && !atLimit ? addButton : undefined} />
      {flash ? (
        <Notice tone="info" role="status">
          {t(`flash.${flash}`)}
        </Notice>
      ) : null}
      {members.length === 0 ? (
        <EmptyState title={t("empty.title")} description={t("empty.body")} action={addButton} />
      ) : (
        <section aria-labelledby="family-list" className="grid gap-4">
          <h2 id="family-list" className="text-lg font-semibold text-ink">
            {t("listLabel", { count: members.length })}
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-start gap-4 rounded-lg border border-border bg-surface p-4">
                <span aria-hidden className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-mist text-forest">
                  <UserRound className="size-5" />
                </span>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <p className="font-semibold break-words text-ink">{m.displayName}</p>
                  <p className="text-ink">{t(`relation.${m.relation}`)}</p>
                  <p className="text-sm text-muted tabular">
                    {t("age", { age: ageOn(m.dateOfBirth, today) })} · {t("born", { date: formatDob(m.dateOfBirth, locale) })}
                  </p>
                </div>
                <Button asChild variant="secondary">
                  <Link href={`/patient/family/${m.id}`} aria-label={t("editLabel", { name: m.displayName })}>
                    <Pencil aria-hidden />
                    {t("edit")}
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
          {atLimit ? <p className="text-sm text-muted">{t("limit", { max: MAX_FAMILY_MEMBERS })}</p> : null}
        </section>
      )}
    </PatientShell>
  );
}

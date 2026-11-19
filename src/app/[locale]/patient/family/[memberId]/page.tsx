import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { GateNotice } from "@/components/shared/gate-notice";
import { InlineError } from "@/components/shared/inline-error";
import { IntlScope } from "@/components/shared/intl-scope";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { RetryAction } from "@/components/shared/retry-action";
import { PatientShell } from "@/components/patient/patient-shell";
import { Link } from "@/i18n/navigation";
import { fail } from "@/lib/api/result";
import { familyMemberSchema } from "@/modules/family-members";
import { removeFamilyMemberAction, updateFamilyMemberAction } from "../actions";
import { MemberForm } from "../_components/member-form";
import { RemoveMember } from "../_components/remove-member";
import { familyPage, redirectIfSignedOut, toLocale } from "../_lib";

export async function generateMetadata() {
  const t = await getTranslations("patientAccount.family.form");
  return { title: t("editTitle"), robots: { index: false } };
}

/** Edit or remove one family member. Unknown and other-account ids show the same "not available" state. */
export default async function FamilyMemberPage({ params }: PageProps<"/[locale]/patient/family/[memberId]">) {
  const { locale: raw, memberId } = await params;
  await connection();
  const locale = toLocale(raw);
  const { api, synthetic } = await familyPage(locale);
  const t = await getTranslations("patientAccount.family");
  const result = await api.get(memberId).catch(() => fail("unavailable"));
  redirectIfSignedOut(result, locale);
  const parsed = result.ok ? familyMemberSchema.safeParse(result.data) : null;

  const header = (
    <PageHeader
      title={t("form.editTitle")}
      breadcrumb={<Breadcrumb items={[{ label: t("title"), href: "/patient/family" }, { label: parsed?.success ? parsed.data.displayName : t("form.editTitle") }]} />}
    />
  );
  const back = (
    <div>
      <Button asChild variant="quiet">
        <Link href="/patient/family">
          <ArrowLeft aria-hidden />
          {t("form.back")}
        </Link>
      </Button>
    </div>
  );

  if (!result.ok || !parsed?.success) {
    const code = result.ok ? "not_found" : result.error.code;
    return (
      <PatientShell synthetic={synthetic}>
        {header}
        {code === "gated" ? (
          <GateNotice reason="contract_pending">{t("state.gated")}</GateNotice>
        ) : code === "not_found" || code === "forbidden" || code === "validation" ? (
          <Notice tone="neutral" icon="lock">
            {t("state.notFound")}
          </Notice>
        ) : (
          <InlineError code={code} action={<RetryAction />} />
        )}
        {back}
      </PatientShell>
    );
  }

  const member = parsed.data;
  return (
    <PatientShell synthetic={synthetic}>
      {header}
      <IntlScope namespaces={["patientAccount"]}>
        <MemberForm mode="edit" member={member} update={updateFamilyMemberAction} />
        <section aria-labelledby="remove-member" className="grid max-w-form gap-3 border-t border-border pt-6">
          <h2 id="remove-member" className="text-lg font-semibold text-ink">
            {t("remove.trigger")}
          </h2>
          <p className="text-muted">{t("remove.body")}</p>
          <div>
            <RemoveMember memberId={member.id} name={member.displayName} version={member.version} remove={removeFamilyMemberAction} />
          </div>
        </section>
      </IntlScope>
    </PatientShell>
  );
}

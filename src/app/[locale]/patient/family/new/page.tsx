import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { IntlScope } from "@/components/shared/intl-scope";
import { PageHeader } from "@/components/shared/page-header";
import { PatientShell } from "@/components/patient/patient-shell";
import { createFamilyMemberAction } from "../actions";
import { MemberForm } from "../_components/member-form";
import { familyPage, toLocale } from "../_lib";

export async function generateMetadata() {
  const t = await getTranslations("patientAccount.family.form");
  return { title: t("newTitle"), robots: { index: false } };
}

export default async function NewFamilyMemberPage({ params }: PageProps<"/[locale]/patient/family/new">) {
  const { locale } = await params;
  await connection();
  const { synthetic } = familyPage(toLocale(locale));
  const t = await getTranslations("patientAccount.family");
  return (
    <PatientShell synthetic={synthetic}>
      <PageHeader
        title={t("form.newTitle")}
        description={t("form.intro")}
        breadcrumb={<Breadcrumb items={[{ label: t("title"), href: "/patient/family" }, { label: t("form.newTitle") }]} />}
      />
      <IntlScope namespaces={["patientAccount"]}>
        <MemberForm mode="new" create={createFamilyMemberAction} />
      </IntlScope>
    </PatientShell>
  );
}

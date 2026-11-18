import { getTranslations } from "next-intl/server";
import { DoctorStaticPage } from "@/components/doctor/static-page";

export async function generateMetadata() {
  const t = await getTranslations("doctor.pages.support");
  return { title: t("title"), robots: { index: false } };
}

export default async function DoctorSupportPage({ params }: PageProps<"/[locale]/doctor/support">) {
  const { locale } = await params;
  return <DoctorStaticPage locale={locale} section="support" />;
}
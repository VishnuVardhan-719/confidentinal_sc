import { getTranslations } from "next-intl/server";
import { DoctorStaticPage } from "@/components/doctor/static-page";

export async function generateMetadata() {
  const t = await getTranslations("doctor.pages.settings");
  return { title: t("title"), robots: { index: false } };
}

export default async function DoctorSettingsPage({ params }: PageProps<"/[locale]/doctor/settings">) {
  const { locale } = await params;
  return <DoctorStaticPage locale={locale} section="settings" />;
}
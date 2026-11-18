import { getTranslations } from "next-intl/server";
import { DoctorStaticPage } from "@/components/doctor/static-page";

export async function generateMetadata() {
  const t = await getTranslations("doctor.pages.profile");
  return { title: t("title"), robots: { index: false } };
}

export default async function DoctorProfilePage({ params }: PageProps<"/[locale]/doctor/profile">) {
  const { locale } = await params;
  return <DoctorStaticPage locale={locale} section="profile" />;
}
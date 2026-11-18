import { getTranslations } from "next-intl/server";
import { DoctorStaticPage } from "@/components/doctor/static-page";

export async function generateMetadata() {
  const t = await getTranslations("doctor.pages.services");
  return { title: t("title"), robots: { index: false } };
}

export default async function DoctorServicesPage({ params }: PageProps<"/[locale]/doctor/services">) {
  const { locale } = await params;
  return <DoctorStaticPage locale={locale} section="services" />;
}
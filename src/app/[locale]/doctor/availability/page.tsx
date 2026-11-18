import { getTranslations } from "next-intl/server";
import { DoctorStaticPage } from "@/components/doctor/static-page";

export async function generateMetadata() {
  const t = await getTranslations("doctor.pages.availability");
  return { title: t("title"), robots: { index: false } };
}

export default async function DoctorAvailabilityPage({ params }: PageProps<"/[locale]/doctor/availability">) {
  const { locale } = await params;
  return <DoctorStaticPage locale={locale} section="availability" />;
}
import { getTranslations } from "next-intl/server";
import { DoctorStaticPage } from "@/components/doctor/static-page";

export async function generateMetadata() {
  const t = await getTranslations("doctor.pages.earnings");
  return { title: t("title"), robots: { index: false } };
}

export default async function DoctorEarningsPage({ params }: PageProps<"/[locale]/doctor/earnings">) {
  const { locale } = await params;
  return <DoctorStaticPage locale={locale} section="earnings" />;
}
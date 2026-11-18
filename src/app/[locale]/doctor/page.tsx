import { redirect } from "@/i18n/navigation";
import { isDoctorLocale } from "@/modules/doctor/routing";

/** /{locale}/doctor has no content of its own; the overview is the workspace home. */
export default async function DoctorIndexPage({ params }: PageProps<"/[locale]/doctor">) {
  const { locale } = await params;
  redirect({ href: "/doctor/dashboard", locale: isDoctorLocale(locale) ? locale : "en" });
}

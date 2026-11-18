import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { pageMetadata } from "@/components/public/seo";
import { DoctorProfile } from "@/components/directory/doctor-profile";
import { DoctorSearchSkeleton } from "@/components/directory/doctor-search-skeleton";
import type { AppLocale } from "@/i18n/routing";

export async function generateMetadata() {
  const t = await getTranslations("booking.search");
  // Profiles are not indexed until real, verified profiles exist.
  return pageMetadata({ locale: (await getLocale()) as AppLocale, path: "/doctors", title: t("metaTitle"), description: t("metaDescription"), noindex: true });
}

export function generateStaticParams() {
  // Cache Components needs one sample param; it is not a real doctor and resolves like any unknown ID.
  return [{ id: "__sample__" }];
}

export default function DoctorProfilePage({ params }: PageProps<"/[locale]/doctors/[id]">) {
  return (
    <Suspense fallback={<DoctorSearchSkeleton />}>
      <DoctorProfile params={params} />
    </Suspense>
  );
}

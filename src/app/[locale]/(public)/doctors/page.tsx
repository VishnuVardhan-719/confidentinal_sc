import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { pageMetadata } from "@/components/public/seo";
import { DoctorSearchIntro, DoctorSearchResults } from "@/components/directory/doctor-search-page";
import { DoctorSearchSkeleton } from "@/components/directory/doctor-search-skeleton";
import type { AppLocale } from "@/i18n/routing";

export async function generateMetadata() {
  const t = await getTranslations("booking.search");
  return pageMetadata({ locale: (await getLocale()) as AppLocale, path: "/doctors", title: t("metaTitle"), description: t("metaDescription") });
}

export default function DoctorsPage({ searchParams }: PageProps<"/[locale]/doctors">) {
  return (
    <>
      <DoctorSearchIntro />
      <Suspense fallback={<DoctorSearchSkeleton />}>
        <DoctorSearchResults searchParams={searchParams} />
      </Suspense>
    </>
  );
}

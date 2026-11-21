import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { AmbulanceDirectoryIntro, AmbulanceDirectoryResults } from "@/components/directory/service-directories";
import { pageMetadata } from "@/components/public/seo";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import type { AppLocale } from "@/i18n/routing";

export async function generateMetadata() {
  const t = await getTranslations("services.ambulanceDirectory");
  return pageMetadata({ locale: (await getLocale()) as AppLocale, path: "/ambulances", title: t("metaTitle"), description: t("metaDescription") });
}

/** Public directory: filter by PIN. Results stream inside Suspense (they depend on the request). */
export default function Page({ searchParams }: PageProps<"/[locale]/ambulances">) {
  return (
    <>
      <AmbulanceDirectoryIntro />
      <Suspense fallback={<LoadingSkeleton variant="list" />}>
        <AmbulanceDirectoryResults searchParams={searchParams} />
      </Suspense>
    </>
  );
}

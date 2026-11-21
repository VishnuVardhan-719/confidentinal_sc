import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { CareDirectoryIntro, CareDirectoryResults } from "@/components/directory/service-directories";
import { pageMetadata } from "@/components/public/seo";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import type { AppLocale } from "@/i18n/routing";

export async function generateMetadata() {
  const t = await getTranslations("services.careDirectory");
  return pageMetadata({ locale: (await getLocale()) as AppLocale, path: "/caretakers", title: t("metaTitle"), description: t("metaDescription") });
}

/** Public directory: filter by PIN. Results stream inside Suspense (they depend on the request). */
export default function Page({ searchParams }: PageProps<"/[locale]/caretakers">) {
  return (
    <>
      <CareDirectoryIntro />
      <Suspense fallback={<LoadingSkeleton variant="list" />}>
        <CareDirectoryResults searchParams={searchParams} />
      </Suspense>
    </>
  );
}

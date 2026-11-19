import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { LabDirectoryIntro, LabDirectoryResults } from "@/components/directory/lab-directory";
import { pageMetadata } from "@/components/public/seo";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import type { AppLocale } from "@/i18n/routing";

export async function generateMetadata() {
  const t = await getTranslations("services.labDirectory");
  return pageMetadata({ locale: (await getLocale()) as AppLocale, path: "/lab-tests", title: t("metaTitle"), description: t("metaDescription") });
}

/** Public lab directory: search by test and city. Results stream inside Suspense (they depend on the request). */
export default function LabTestsPage({ searchParams }: PageProps<"/[locale]/lab-tests">) {
  return (
    <>
      <LabDirectoryIntro />
      <Suspense fallback={<LoadingSkeleton variant="list" />}>
        <LabDirectoryResults searchParams={searchParams} />
      </Suspense>
    </>
  );
}

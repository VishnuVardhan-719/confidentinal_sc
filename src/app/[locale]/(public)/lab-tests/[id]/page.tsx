import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { LabDetail } from "@/components/directory/lab-directory";
import { pageMetadata } from "@/components/public/seo";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import type { AppLocale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/lab-tests/[id]">) {
  const { id } = await params;
  const t = await getTranslations("services.labDirectory");
  // Lab pages are not indexed until real, verified labs exist; the canonical points at this lab's own URL.
  return pageMetadata({ locale: (await getLocale()) as AppLocale, path: `/lab-tests/${encodeURIComponent(id)}`, title: t("metaTitle"), description: t("metaDescription"), noindex: true });
}

export function generateStaticParams() {
  // Cache Components needs one sample param; it is not a real lab and resolves like any unknown id.
  return [{ id: "__sample__" }];
}

export default function LabDetailPage({ params }: PageProps<"/[locale]/lab-tests/[id]">) {
  return (
    <Suspense fallback={<LoadingSkeleton variant="detail" />}>
      <LabDetail params={params} />
    </Suspense>
  );
}

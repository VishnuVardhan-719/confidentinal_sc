import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { AmbulanceDetail } from "@/components/directory/service-directories";
import { pageMetadata } from "@/components/public/seo";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import type { AppLocale } from "@/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/ambulances/[id]">) {
  const { id } = await params;
  const t = await getTranslations("services.ambulanceDirectory");
  // Not indexed until real, verified providers exist; the canonical points at this provider's own URL.
  return pageMetadata({ locale: (await getLocale()) as AppLocale, path: `/ambulances/${encodeURIComponent(id)}`, title: t("metaTitle"), description: t("metaDescription"), noindex: true });
}

export function generateStaticParams() {
  // Cache Components needs one sample param; it is not a real provider and resolves like any unknown id.
  return [{ id: "__sample__" }];
}

export default function DetailPage({ params }: PageProps<"/[locale]/ambulances/[id]">) {
  return (
    <Suspense fallback={<LoadingSkeleton variant="detail" />}>
      <AmbulanceDetail params={params} />
    </Suspense>
  );
}

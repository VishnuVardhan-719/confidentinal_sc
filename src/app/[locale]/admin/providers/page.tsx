import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccessDenied } from "@/components/auth/access-denied";
import { PageLoading } from "@/components/auth/page-loading";
import { AdminFilters } from "@/components/onboarding/admin-filters";
import { AdminLoadState } from "@/components/onboarding/admin-states";
import { EmptyState } from "@/components/shared/empty-state";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { PROVIDER_CATEGORIES } from "@/modules/auth/roles";
import { getRequestApis, isFixtureAdapter, requireRole } from "@/modules/auth/server";
import { loadReviewQueue } from "@/modules/verification/flows";
import { EXPIRY_WINDOWS } from "@/modules/verification/queries";
import { PROVIDER_STATUSES, presentProviderStatus } from "@/modules/verification/status";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding.adminReview.queue");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default function ReviewQueuePage({ searchParams }: PageProps<"/[locale]/admin/providers">) {
  return (
    <Suspense fallback={<PageLoading variant="list" />}>
      <ReviewQueue searchParams={searchParams} />
    </Suspense>
  );
}

async function ReviewQueue({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locale = await getLocale();
  const access = await requireRole("admin", { locale, path: `/${locale}/admin/providers` });
  if (access.kind === "denied") return <AccessDenied reason={access.reason} />;
  await connection();
  const [params, t, format, { verification }] = await Promise.all([searchParams, getTranslations("onboarding"), getFormatter(), getRequestApis()]);
  const { filter, result } = await loadReviewQueue(verification, params);
  const date = (iso: string | null) => (iso ? format.dateTime(new Date(iso), { dateStyle: "medium" }) : t("adminReview.queue.noExpiry"));

  return (
    <div className="grid gap-8">
      {isFixtureAdapter() ? <FixtureNotice /> : null}
      <PageHeader title={t("adminReview.queue.title")} description={t("adminReview.queue.lead")} />
      <AdminFilters
        selects={[
          {
            name: "category",
            label: t("adminReview.queue.category"),
            value: filter.category ?? "",
            options: PROVIDER_CATEGORIES.map((c) => ({ value: c, label: t(`adminReview.categories.${c}`) })),
          },
          {
            name: "status",
            label: t("adminReview.queue.status"),
            value: filter.status ?? "",
            options: PROVIDER_STATUSES.map((s) => ({ value: s, label: t(`providerStatus.${s}`) })),
          },
          {
            name: "expiry",
            label: t("adminReview.queue.expiry"),
            value: filter.expiry ?? "",
            options: EXPIRY_WINDOWS.map((w) => ({ value: w, label: t(`adminReview.expiryWindows.${w}`) })),
          },
        ]}
      />
      {result.kind !== "ready" ? (
        <AdminLoadState state={result} />
      ) : result.data.length === 0 ? (
        <EmptyState title={t("adminReview.queue.emptyTitle")} description={t("adminReview.queue.emptyBody")} />
      ) : (
        <Table label={t("adminReview.queue.tableLabel")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("adminReview.queue.name")}</TableHead>
              <TableHead>{t("adminReview.queue.category")}</TableHead>
              <TableHead>{t("adminReview.queue.status")}</TableHead>
              <TableHead>{t("adminReview.queue.submitted")}</TableHead>
              <TableHead>{t("adminReview.queue.earliestExpiry")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.map((item) => {
              const status = presentProviderStatus(item.status);
              return (
                <TableRow key={item.providerId}>
                  <TableCell>
                    <Link href={`/admin/providers/${item.providerId}`} className="font-semibold text-forest underline underline-offset-4">
                      {item.displayName}
                    </Link>
                  </TableCell>
                  <TableCell>{t(`adminReview.categories.${item.category}`)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={status.tone} label={t(status.labelKey.replace("onboarding.", "") as never)} />
                  </TableCell>
                  <TableCell>{date(item.submittedAt)}</TableCell>
                  <TableCell>{date(item.earliestDocumentExpiry)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

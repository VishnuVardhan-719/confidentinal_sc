import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccessDenied } from "@/components/auth/access-denied";
import { PageLoading } from "@/components/auth/page-loading";
import { AdminDecision } from "@/components/onboarding/admin-decision";
import { AdminFilters } from "@/components/onboarding/admin-filters";
import { AdminLoadState } from "@/components/onboarding/admin-states";
import { EmptyState } from "@/components/shared/empty-state";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { PageHeader } from "@/components/shared/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PROVIDER_CATEGORIES } from "@/modules/auth/roles";
import { getRequestApis, isFixtureAdapter, requireRole } from "@/modules/auth/server";
import { loadCoverage } from "@/modules/verification/flows";
import { COVERAGE_STATES } from "@/modules/verification/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding.adminReview.coverage");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default function CoveragePage({ searchParams }: PageProps<"/[locale]/admin/coverage">) {
  return (
    <Suspense fallback={<PageLoading variant="list" />}>
      <Coverage searchParams={searchParams} />
    </Suspense>
  );
}

async function Coverage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locale = await getLocale();
  const access = await requireRole("admin", { locale, path: `/${locale}/admin/coverage` });
  if (access.kind === "denied") return <AccessDenied reason={access.reason} />;
  await connection();
  const [params, t, format, { verification }] = await Promise.all([searchParams, getTranslations("onboarding.adminReview"), getFormatter(), getRequestApis()]);
  const { filter, result } = await loadCoverage(verification, params);

  return (
    <div className="grid gap-8">
      {isFixtureAdapter() ? <FixtureNotice /> : null}
      <PageHeader title={t("coverage.title")} description={t("coverage.lead")} />
      <AdminFilters
        selects={[
          {
            name: "category",
            label: t("coverage.category"),
            value: filter.category ?? "",
            options: PROVIDER_CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) })),
          },
          {
            name: "state",
            label: t("coverage.state"),
            value: filter.state ?? "",
            options: COVERAGE_STATES.map((s) => ({ value: s, label: t(`coverage.states.${s}`) })),
          },
        ]}
        texts={[{ name: "pin", label: t("coverage.pin"), hint: t("coverage.pinHint"), value: filter.pin ?? "", inputMode: "numeric", pattern: "[1-9][0-9]{5}", maxLength: 6 }]}
      />
      {result.kind !== "ready" ? (
        <AdminLoadState state={result} />
      ) : result.data.length === 0 ? (
        <EmptyState title={t("coverage.emptyTitle")} description={t("coverage.emptyBody")} />
      ) : (
        <Table label={t("coverage.tableLabel")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("coverage.pin")}</TableHead>
              <TableHead>{t("coverage.provider")}</TableHead>
              <TableHead>{t("coverage.category")}</TableHead>
              <TableHead>{t("coverage.state")}</TableHead>
              <TableHead>{t("coverage.validUntil")}</TableHead>
              <TableHead>{t("coverage.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.map((area) => (
              <TableRow key={area.areaId}>
                <TableCell className="font-semibold tabular-nums">{area.pinCode}</TableCell>
                <TableCell>{area.providerName}</TableCell>
                <TableCell>{t(`categories.${area.category}`)}</TableCell>
                <TableCell>{t(`coverage.states.${area.state}`)}</TableCell>
                <TableCell>{area.validUntil ? format.dateTime(new Date(area.validUntil), { dateStyle: "medium" }) : t("coverage.noEnd")}</TableCell>
                <TableCell>
                  {area.decisions.length === 0 ? (
                    <span className="text-sm text-muted">{t("coverage.noActions")}</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {area.decisions.map((d) => (
                        <AdminDecision
                          key={d}
                          kind="coverage"
                          label={t(`decision.${d as "approve" | "reject" | "revoke"}`)}
                          subject={`${area.pinCode} · ${area.providerName}`}
                          fields={{ areaId: area.areaId, decision: d, expectedVersion: area.version }}
                          locale={locale}
                          tone={d === "approve" ? "primary" : "danger"}
                        />
                      ))}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

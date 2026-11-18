import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { z } from "zod";
import { AccessDenied } from "@/components/auth/access-denied";
import { PageLoading } from "@/components/auth/page-loading";
import { AdminDecision, GatedDocumentViewer } from "@/components/onboarding/admin-decision";
import { AdminLoadState } from "@/components/onboarding/admin-states";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getRequestApis, isFixtureAdapter, requireRole } from "@/modules/auth/server";
import { loadReviewDetail } from "@/modules/verification/flows";
import { presentProviderStatus, type ProviderStatusDisplay } from "@/modules/verification/status";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding.adminReview.detail");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default function ReviewDetailPage({ params }: PageProps<"/[locale]/admin/providers/[id]">) {
  return (
    <Suspense fallback={<PageLoading variant="detail" />}>
      <ReviewDetail params={params} />
    </Suspense>
  );
}

async function ReviewDetail({ params }: { params: Promise<{ id: string }> }) {
  const locale = await getLocale();
  const { id } = await params;
  const access = await requireRole("admin", { locale, path: `/${locale}/admin/providers/${encodeURIComponent(id)}` });
  if (access.kind === "denied") return <AccessDenied reason={access.reason} />;
  await connection();
  const [t, format, { verification }] = await Promise.all([getTranslations("onboarding"), getFormatter(), getRequestApis()]);
  const parsedId = z.uuid().safeParse(id);
  const load = parsedId.success ? await loadReviewDetail(verification, parsedId.data) : ({ kind: "not_found" } as const);

  const crumbs = <Breadcrumb items={[{ label: t("adminReview.detail.back"), href: "/admin/providers" }, { label: t("adminReview.detail.metaTitle") }]} />;
  if (load.kind !== "ready") {
    return (
      <div className="grid gap-8">
        <PageHeader title={t("adminReview.detail.metaTitle")} breadcrumb={crumbs} />
        <AdminLoadState state={load} />
      </div>
    );
  }

  const { detail, decisions, canStartReview } = load.data;
  const name = detail.displayName ?? t("adminReview.detail.unnamed");
  const statusText = (s: ProviderStatusDisplay) => t(presentProviderStatus(s).labelKey.replace("onboarding.", "") as never);
  const status = presentProviderStatus(detail.status);
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });
  const base = { providerId: detail.providerId, expectedVersion: detail.version };

  return (
    <div className="grid gap-8">
      {isFixtureAdapter() ? <FixtureNotice /> : null}
      <PageHeader
        title={name}
        breadcrumb={crumbs}
        meta={
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone={status.tone} label={statusText(detail.status)} />
            <span className="text-sm text-muted">{t(`adminReview.categories.${detail.category}`)}</span>
            <span className="text-sm text-muted">{t("adminReview.detail.version", { version: detail.version })}</span>
          </div>
        }
      />

      <section aria-labelledby="decisions-title" className="grid gap-3 rounded-lg border border-border bg-paper p-5">
        <h2 id="decisions-title" className="text-lg font-semibold text-ink">
          {t("adminReview.detail.decisions")}
        </h2>
        {canStartReview ? <Notice tone="info">{t("adminReview.detail.startReviewFirst")}</Notice> : null}
        <div className="flex flex-wrap gap-3">
          {canStartReview ? (
            <AdminDecision kind="start" label={t("adminReview.decision.startReview")} subject={name} fields={base} locale={locale} confirmRequired={false} />
          ) : null}
          {decisions.map((d) => (
            <AdminDecision
              key={d}
              kind="review"
              label={t(`adminReview.decision.${d}`)}
              subject={name}
              fields={{ ...base, decision: d }}
              locale={locale}
              tone={d === "approve" ? "primary" : d === "changes_required" ? "secondary" : "danger"}
            />
          ))}
        </div>
        {!canStartReview && decisions.length === 0 ? <p className="text-base text-muted">{t("adminReview.detail.noDecisions")}</p> : null}
      </section>

      <section aria-labelledby="description-title" className="grid gap-2">
        <h2 id="description-title" className="text-lg font-semibold text-ink">
          {t("adminReview.detail.description")}
        </h2>
        <p className="whitespace-pre-line text-base text-ink">{detail.description || t("adminReview.detail.noDescription")}</p>
      </section>

      <section aria-labelledby="documents-title" className="grid gap-3">
        <h2 id="documents-title" className="text-lg font-semibold text-ink">
          {t("adminReview.detail.documents")}
        </h2>
        {detail.documents.length === 0 ? (
          <p className="text-base text-muted">{t("adminReview.detail.noDocuments")}</p>
        ) : (
          <Table label={t("adminReview.detail.documents")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("adminReview.detail.documentKind")}</TableHead>
                <TableHead>{t("adminReview.detail.documentStatus")}</TableHead>
                <TableHead>{t("adminReview.detail.documentExpires")}</TableHead>
                <TableHead>{t("adminReview.detail.documentAdded")}</TableHead>
                <TableHead>
                  <span className="sr-only">{t("adminReview.detail.viewDocument")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.documents.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{t(`documentKinds.${d.kind}`)}</TableCell>
                  <TableCell>{t(`providerWizard.evidenceStatus.${d.status}`)}</TableCell>
                  <TableCell>{date(d.expiresAt)}</TableCell>
                  <TableCell>{date(d.createdAt)}</TableCell>
                  <TableCell>
                    <GatedDocumentViewer />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section aria-labelledby="history-title" className="grid gap-3">
        <h2 id="history-title" className="text-lg font-semibold text-ink">
          {t("adminReview.detail.history")}
        </h2>
        {detail.events.length === 0 ? (
          <p className="text-base text-muted">{t("adminReview.detail.noHistory")}</p>
        ) : (
          <ol className="grid gap-3">
            {detail.events.map((e) => (
              <li key={`${e.providerVersion}-${e.occurredAt}`} className="grid gap-1 rounded-md border border-border p-3">
                <p className="text-sm text-muted">{date(e.occurredAt)}</p>
                <p className="text-base text-ink">
                  {statusText(e.fromState)} → {statusText(e.toState)}
                </p>
                {e.publicReason ? <p className="text-base text-ink">{e.publicReason}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

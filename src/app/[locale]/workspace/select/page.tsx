import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AccessDenied } from "@/components/auth/access-denied";
import { PageLoading } from "@/components/auth/page-loading";
import { EmptyState } from "@/components/shared/empty-state";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Link } from "@/i18n/navigation";
import { isFixtureAdapter, requireSession } from "@/modules/auth/server";
import { workspaceChoices } from "@/modules/auth/workspaces";
import { WORKSPACE_STATE_TONE, withoutLocale } from "@/components/auth/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.workspace");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default function WorkspaceSelectPage() {
  return (
    <Suspense fallback={<PageLoading variant="list" />}>
      <WorkspaceSelect />
    </Suspense>
  );
}

async function WorkspaceSelect() {
  const locale = await getLocale();
  const access = await requireSession({ locale, path: `/${locale}/workspace/select` });
  if (access.kind === "denied") return <AccessDenied reason={access.reason} />;
  const [t, tAuth] = await Promise.all([getTranslations("auth.workspace"), getTranslations("auth")]);
  const choices = workspaceChoices(access.identity, locale);

  return (
    <div className="grid gap-8">
      {isFixtureAdapter() ? <FixtureNotice /> : null}
      <PageHeader title={t("title")} description={t("lead")} />
      {choices.length === 0 ? (
        <EmptyState title={t("empty")} description={t("emptyBody")} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {choices.map((c) => (
            <li key={c.key}>
              <Link
                href={withoutLocale(c.href)}
                className="group grid min-h-24 gap-2 rounded-lg border border-border bg-surface p-5 hover:border-forest focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-xl font-semibold text-ink">{tAuth(`roles.${c.role}`)}</span>
                  <ArrowRight aria-hidden className="size-5 text-forest transition-transform duration-(--scv-duration-fast) group-hover:translate-x-0.5" />
                </span>
                {c.organizationName ? <span className="text-base text-muted">{t("organization", { name: c.organizationName })}</span> : null}
                <span className="flex flex-wrap gap-2">
                  <StatusBadge tone={WORKSPACE_STATE_TONE[c.state]} label={tAuth(`workspaceState.${c.state}`)} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

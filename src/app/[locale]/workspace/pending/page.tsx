import type { Metadata } from "next";
import { ArrowRight, Check, Clock3, ShieldCheck } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AccessDenied } from "@/components/auth/access-denied";
import { PageLoading } from "@/components/auth/page-loading";
import { withoutLocale } from "@/components/auth/paths";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { FixtureNotice } from "@/components/shared/fixture-notice";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { ROLES, type Role } from "@/modules/auth/roles";
import { isApprovalGatedRole, landingPathFor } from "@/modules/auth/routes";
import { isFixtureAdapter, requireSession } from "@/modules/auth/server";
import { workspaceChoices } from "@/modules/auth/workspaces";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.pending");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function PendingApprovalPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageLoading variant="detail" />}>
      <PendingApproval searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Provider approval gate. A doctor, laboratory, ambulance operator or caretaker whose application is with
 * the admin lands here (straight after submitting, and on every later sign-in) and sees only this message.
 * No dashboard link is rendered for the pending workspace. The route guard enforces the same rule server
 * side; this page grants nothing. Patients never see it.
 */
async function PendingApproval({ searchParams }: { searchParams: SearchParams }) {
  const locale = await getLocale();
  const access = await requireSession({ locale, path: `/${locale}/workspace/pending` });
  if (access.kind === "denied") return <AccessDenied reason={access.reason} />;
  const params = await searchParams;
  const requested = typeof params.role === "string" ? params.role : undefined;
  const requestedRole = (ROLES as readonly string[]).includes(requested ?? "") ? (requested as Role) : null;

  const choices = workspaceChoices(access.identity, locale);
  const waiting = choices.filter((c) => c.state === "pending_review" && isApprovalGatedRole(c.role));
  const role = waiting[0]?.role ?? (requestedRole && isApprovalGatedRole(requestedRole) ? requestedRole : null);
  // Nothing is awaiting approval for this account: this page has no business here.
  if (!role) redirect(landingPathFor(access.identity, locale));
  // The same role became usable (admin approved it): send them in.
  const approved = choices.find((c) => c.role === role && c.state === "active");
  if (approved) redirect(approved.href);

  const [t, tAuth] = await Promise.all([getTranslations("auth.pending"), getTranslations("auth")]);
  const roleName = tAuth(`roles.${role}`);
  const others = choices.filter((c) => c.state === "active" && c.role !== role);

  const steps = [
    { icon: Check, title: t("steps.sent.title"), body: t("steps.sent.body"), done: true },
    { icon: ShieldCheck, title: t("steps.review.title"), body: t("steps.review.body"), done: false },
    { icon: Clock3, title: t("steps.open.title", { role: roleName }), body: t("steps.open.body"), done: false },
  ];

  return (
    <div className="mx-auto grid max-w-form gap-8">
      {isFixtureAdapter() ? <FixtureNotice /> : null}
      <header className="grid gap-3">
        <p className="inline-flex w-fit items-center gap-2 rounded-full bg-info-surface px-3 py-1 text-sm font-semibold text-ink">
          <Clock3 aria-hidden className="size-4" />
          {t("badge", { role: roleName })}
        </p>
        <h1 className="font-display text-3xl font-medium text-ink sm:text-4xl">{t("title")}</h1>
        <p className="text-lg text-ink/90">{t("lead")}</p>
      </header>

      <ol className="grid gap-3" aria-label={t("stepsLabel")}>
        {steps.map(({ icon: Icon, title, body, done }) => (
          <li key={title} className="flex gap-4 rounded-lg border border-border bg-surface p-4">
            <span
              aria-hidden
              className={`grid size-9 shrink-0 place-items-center rounded-full ${done ? "bg-forest text-on-forest" : "border border-border bg-paper-deep text-muted"}`}
            >
              <Icon className="size-4" />
            </span>
            <div className="grid gap-1">
              <h2 className="text-base font-semibold text-ink">{title}</h2>
              <p className="text-base text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="text-base text-muted">{t("signInAgain")}</p>

      <div className="flex flex-wrap items-center gap-3">
        {others.map((c) => (
          <Button key={c.key} asChild variant="secondary">
            <Link href={withoutLocale(c.href)}>
              {t("openOther", { role: tAuth(`roles.${c.role}`) })}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        ))}
        <SignOutButton locale={locale} label={t("signOut")} variant={others.length > 0 ? "quiet" : "secondary"} />
      </div>
    </div>
  );
}

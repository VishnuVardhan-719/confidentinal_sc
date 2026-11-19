import { ArrowRight, CalendarDays, FileText, LifeBuoy, Search, UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { RetryAction } from "@/components/shared/retry-action";
import { SectionHeading } from "@/components/shared/section-heading";
import { StatusBadge } from "@/components/shared/status-badge";
import { asTk, badgeFor } from "@/components/clinical/kit";
import { NotificationList } from "@/components/patient/notification-list";
import { PatientShell } from "@/components/patient/patient-shell";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/lib/format";
import { createPatientApi } from "@/modules/patient/api";
import { loadPatientDashboard, type DashboardBooking, type ProfilePrompt } from "@/modules/patient-dashboard/loader";
import { authorizerFor, dashboardBookingsApi, getPatientSession, patientLoginRedirect } from "@/modules/patient-dashboard/session";
import { getNotificationsApi, unreadCount, type NotificationsApi } from "@/modules/notifications";
import { createPaymentsApi } from "@/modules/payments/api";
import { getRecordsApi } from "@/modules/records";

export async function generateMetadata() {
  const t = await getTranslations("patient.dashboard");
  return { title: t("title"), robots: { index: false } };
}

const toLocale = (l: string): Locale => (l === "te" || l === "hi" ? l : "en");
/** Card hrefs from fe2-c include the locale; i18n Link adds it again. */
const localeless = (href: string) => href.replace(/^\/(en|te|hi)(?=\/)/, "");

export default async function PatientDashboardPage({ params }: PageProps<"/[locale]/patient/dashboard">) {
  const { locale: raw } = await params;
  await connection();
  const locale = toLocale(raw);
  const session = getPatientSession();
  // Advisory UI guard; the module adapters and backend authorize every read independently.
  if (session.status !== "ok") redirect(patientLoginRedirect(locale, `/${locale}/patient/dashboard`));

  const [t, tAll] = await Promise.all([getTranslations("patient.dashboard"), getTranslations()]);
  const tk = asTk(tAll);
  const env = process.env;
  const d = await loadPatientDashboard(
    {
      authorizePatient: authorizerFor(env),
      bookings: dashboardBookingsApi(env),
      payments: createPaymentsApi(env),
      patient: createPatientApi(env),
      records: getRecordsApi(env, { fixtureActor: session.fixtureActor ?? undefined }),
    },
    locale,
    new Date(),
  );

  const notifications = getNotificationsApi(env, { fixtureActor: session.fixtureActor ?? undefined });

  return (
    <PatientShell synthetic={session.synthetic} fixtureActor={session.fixtureActor}>
        <PageHeader title={t("title")} description={t("description")} />

        <ProfileSection prompt={d.profile} />

        <section aria-labelledby="upcoming-bookings" className="grid gap-4">
          <div className="flex items-end justify-between gap-4">
            <SectionHeading id="upcoming-bookings" title={t("upcoming.title")} size="md" />
            <Link href="/patient/bookings" className="inline-flex min-h-target items-center text-forest underline-offset-4 hover:underline">
              {t("upcoming.viewAll")}
            </Link>
          </div>
          {d.upcoming.kind === "ready" ? (
            <>
              <ul className="grid gap-3" aria-label={t("upcoming.title")}>
                {d.upcoming.data.map((b) => (
                  <BookingCard key={b.id} booking={b} tk={tk} />
                ))}
              </ul>
              {d.moreUpcoming ? <p className="text-sm text-muted">{t("upcoming.more", { count: d.upcoming.data.length })}</p> : null}
            </>
          ) : d.upcoming.kind === "empty" ? (
            <EmptyState
              title={t("upcoming.empty")}
              description={t("upcoming.emptyBody")}
              headingLevel="h3"
              action={
                <Button asChild>
                  <Link href="/doctors">{t("actions.findDoctor")}</Link>
                </Button>
              }
            />
          ) : d.upcoming.kind === "denied" || d.upcoming.kind === "not_found" ? (
            <Notice tone="neutral" icon="lock" title={t("state.denied")} />
          ) : d.upcoming.kind === "gated" ? (
            <Notice tone="neutral" title={t("state.gated")} />
          ) : d.upcoming.kind === "error" ? (
            <InlineError code={d.upcoming.code} action={d.upcoming.retryable ? <RetryAction /> : undefined} />
          ) : (
            <InlineError code="unauthenticated" />
          )}
        </section>

        <RecentNotifications api={notifications} />

        <QuickActions />
    </PatientShell>
  );
}

/** Latest three notifications; text from templates only (no PHI). Hidden when not connected. */
async function RecentNotifications({ api }: { api: NotificationsApi }) {
  const t = await getTranslations("patient.dashboard.notifications");
  const r = await api.listMine();
  if (!r.ok && r.error.code === "gated") return null;
  return (
    <section aria-labelledby="recent-notifications" className="grid gap-4">
      <div className="flex items-end justify-between gap-4">
        <SectionHeading id="recent-notifications" title={t("title")} size="md" />
        <Link href="/patient/notifications" className="inline-flex min-h-target items-center text-forest underline-offset-4 hover:underline">
          {r.ok && unreadCount(r.data) > 0 ? t("viewAllUnread", { count: unreadCount(r.data) }) : t("viewAll")}
        </Link>
      </div>
      {!r.ok ? (
        <InlineError code={r.error.code} action={r.error.code === "unavailable" ? <RetryAction /> : undefined} />
      ) : r.data.length === 0 ? (
        <p className="text-muted">{t("empty")}</p>
      ) : (
        <NotificationList items={r.data.slice(0, 3)} label={t("title")} />
      )}
    </section>
  );
}

async function BookingCard({ booking: b, tk }: { booking: DashboardBooking; tk: ReturnType<typeof asTk> }) {
  const t = await getTranslations("patient.dashboard.card");
  const rows: { label: string; badge: ReturnType<typeof badgeFor> }[] = [
    { label: t("booking"), badge: badgeFor(b.booking, tk) },
    ...(b.visit ? [{ label: t("visit"), badge: badgeFor(b.visit, tk) }] : []),
    { label: t("payment"), badge: badgeFor(b.payment, tk) },
    { label: t("clinical"), badge: badgeFor(b.clinical, tk) },
  ];
  const category = (["doctor", "lab", "ambulance", "caretaker"] as const).find((c) => c === b.category);
  return (
    <li className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-[1fr_auto] sm:items-start">
      <div className="grid gap-1">
        <p className="font-semibold">{category ? t(`category.${category}`) : b.category}</p>
        <p className="tabular">{b.start}</p>
        <p className="text-sm text-muted tabular">
          {b.reference ? t("reference", { reference: b.reference }) : t("noReference")} · {t("price", { price: b.price })}
        </p>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2" aria-label={t("statuses")}>
          {rows.map((r) => (
            <div key={r.label} className="flex flex-wrap items-center gap-2">
              <dt className="text-sm text-muted">{r.label}</dt>
              <dd>
                <StatusBadge {...r.badge} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <Button asChild variant="secondary">
        <Link href={localeless(b.href)}>
          {t("open")}
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    </li>
  );
}

async function ProfileSection({ prompt }: { prompt: ProfilePrompt }) {
  const t = await getTranslations("patient.dashboard.profile");
  if (prompt.kind === "complete") return null;
  if (prompt.kind === "unknown") {
    return (
      <Notice
        tone="neutral"
        title={t("unknown")}
        action={
          <Button asChild variant="secondary">
            <Link href="/patient/profile">{t("open")}</Link>
          </Button>
        }
      />
    );
  }
  return (
    <section aria-labelledby="profile-prompt" className="grid gap-3 rounded-lg border border-border bg-surface p-5">
      <h2 id="profile-prompt" className="text-lg font-semibold">
        {t("title")}
      </h2>
      <p className="tabular">{t("progress", { done: prompt.done, total: prompt.total })}</p>
      <progress className="h-2 w-full accent-forest" max={prompt.total} value={prompt.done} aria-label={t("progress", { done: prompt.done, total: prompt.total })} />
      <p className="text-sm text-muted">{t("body")}</p>
      {prompt.missing.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">{t("missing")}</h3>
          <ul className="flex flex-wrap gap-2">
            {prompt.missing.map((m) => (
              <li key={m.key}>
                <Link href={m.href} className="inline-flex min-h-target items-center rounded-md border border-border px-3 text-sm underline-offset-4 hover:underline">
                  {t(`item.${m.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <Button asChild>
          <Link href="/patient/profile">{t("action")}</Link>
        </Button>
      </div>
    </section>
  );
}

async function QuickActions() {
  const t = await getTranslations("patient.dashboard.actions");
  const items: { href: string; title: string; hint: string; icon: ReactNode }[] = [
    { href: "/doctors", title: t("findDoctor"), hint: t("findDoctorHint"), icon: <Search aria-hidden className="size-5" /> },
    { href: "/patient/bookings", title: t("bookings"), hint: t("bookingsHint"), icon: <CalendarDays aria-hidden className="size-5" /> },
    { href: "/patient/records", title: t("records"), hint: t("recordsHint"), icon: <FileText aria-hidden className="size-5" /> },
    { href: "/patient/profile", title: t("profile"), hint: t("profileHint"), icon: <UserRound aria-hidden className="size-5" /> },
    { href: "/emergency", title: t("emergency"), hint: t("emergencyHint"), icon: <LifeBuoy aria-hidden className="size-5" /> },
  ];
  return (
    <section aria-labelledby="quick-actions" className="grid gap-4">
      <SectionHeading id="quick-actions" title={t("title")} size="md" />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              className="flex min-h-target items-start gap-3 rounded-lg border border-border bg-surface p-4 hover:border-forest focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <span className="mt-0.5 text-forest">{i.icon}</span>
              <span className="grid gap-1">
                <span className="font-semibold">{i.title}</span>
                <span className="text-sm text-muted">{i.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

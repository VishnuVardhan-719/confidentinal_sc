import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/shared/notice";
import { Link } from "@/i18n/navigation";
import { isDoctorLocale, type DoctorLocale } from "@/modules/doctor/routing";
import { requireDoctorSession, type DoctorSession } from "@/modules/doctor/session";

export type GuardedPage = { ok: true; session: DoctorSession; locale: DoctorLocale } | { ok: false; view: ReactElement };

/**
 * Server-side page guard for /[locale]/doctor/**. Advisory for the UI only: the module adapters
 * and the backend enforce authorization independently on every read and write.
 * Unauthenticated -> login with a safe `next`; wrong role -> own landing; unusable workspace -> denied view.
 */
export async function guardDoctorPage(locale: string, path: string): Promise<GuardedPage> {
  await connection();
  const loc: DoctorLocale = isDoctorLocale(locale) ? locale : "en";
  // fe-b requireRole: signed out -> login?next, incomplete -> onboarding, wrong role -> own landing.
  const access = await requireDoctorSession(loc, `/${loc}/doctor${path}`);
  if (!access.ok) return { ok: false, view: <DeniedView reason={access.reason} /> };
  return { ok: true, session: access.session, locale: loc };
}

export async function DeniedView({ reason }: { reason: "forbidden" | "restricted" }) {
  const t = await getTranslations("doctor.guard");
  return (
    <div className="mx-auto grid max-w-form gap-6 py-10">
      <Notice tone="neutral" icon="lock" title={reason === "forbidden" ? t("deniedTitle") : t("restrictedTitle")}>
        {reason === "forbidden" ? t("deniedBody") : t("restrictedBody")}
      </Notice>
      <div>
        <Button asChild variant="secondary">
          <Link href="/">{t("home")}</Link>
        </Button>
      </div>
    </div>
  );
}

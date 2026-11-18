import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { GateNotice } from "@/components/shared/gate-notice";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { Link } from "@/i18n/navigation";
import { guardDoctorPage } from "./guard";

type Section = "availability" | "services" | "profile" | "earnings" | "support" | "settings";

/**
 * Workspace sections with no backend contract yet. They say so plainly instead of rendering
 * controls that would do nothing (no fake CTAs). Earnings is behind the payouts gate.
 */
export async function DoctorStaticPage({ locale, section }: { locale: string; section: Section }) {
  const g = await guardDoctorPage(locale, `/${section}`);
  if (!g.ok) return g.view;
  const t = await getTranslations(`doctor.pages.${section}`);
  const tp = await getTranslations("doctor.pages");
  let action: ReactNode = null;
  if (section === "profile") action = <Button asChild variant="secondary"><Link href="/doctor/onboarding">{tp("profile.onboarding")}</Link></Button>;
  if (section === "support") action = <Button asChild variant="secondary"><Link href="/contact">{tp("support.contact")}</Link></Button>;
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} />
      {section === "earnings" ? (
        <GateNotice feature="automatedPayouts">{t("body")}</GateNotice>
      ) : (
        <Notice tone="neutral" action={action}>
          {t("body")}
        </Notice>
      )}
    </div>
  );
}

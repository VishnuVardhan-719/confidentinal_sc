import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Container, PublicPageIntro } from "@/components/public/layout";
import { publicPageMetadata } from "@/components/public/metadata";
import { GateNotice } from "@/components/shared/gate-notice";
import { Link } from "@/i18n/navigation";

export function generateMetadata() {
  return publicPageMetadata("memberships", "/memberships");
}

const PRINCIPLES = ["published", "noCoverage", "optional"] as const;

/** Informational only: nothing is sold (subscriptions flag stays off until approved). */
export default function MembershipsPage() {
  const t = useTranslations("public.membershipsPage");
  return (
    <>
      <PublicPageIntro title={t("title")} lead={t("lead")} />
      <Container className="grid gap-12 pb-20 lg:grid-cols-12">
        <div className="grid content-start gap-6 lg:col-span-5">
          <GateNotice feature="subscriptions" title={t("statusTitle")}>
            {t("statusBody")}
          </GateNotice>
          <div>
            <Button asChild variant="secondary">
              <Link href="/#finder">{t("cta")}</Link>
            </Button>
          </div>
        </div>
        <section aria-labelledby="principles" className="lg:col-span-6 lg:col-start-7">
          <h2 id="principles" className="font-display text-2xl font-medium text-ink">
            {t("principlesTitle")}
          </h2>
          <ul className="mt-4 grid border-t border-border">
            {PRINCIPLES.map((k) => (
              <li key={k} className="border-b border-border py-4 text-lg text-ink">
                {t(`principles.${k}`)}
              </li>
            ))}
          </ul>
        </section>
      </Container>
    </>
  );
}

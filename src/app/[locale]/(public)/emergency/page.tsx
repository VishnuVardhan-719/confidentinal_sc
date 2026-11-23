import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Container } from "@/components/public/layout";
import { publicPageMetadata } from "@/components/public/metadata";
import { GateNotice } from "@/components/shared/gate-notice";

export function generateMetadata() {
  return publicPageMetadata("emergency", "/emergency");
}

const STEPS = ["location", "stay", "move", "follow", "door"] as const;

/**
 * Emergency guidance. Fully server-rendered: works without sign-in, JavaScript, payment or the
 * health questionnaire, and has no decorative motion. The 112 link is a plain tel: anchor.
 */
export default function EmergencyPage() {
  const t = useTranslations("public.emergency");
  return (
    <Container className="grid gap-12 py-12 md:py-20">
      <div className="grid gap-6">
        <h1 className="max-w-3xl font-display text-[clamp(2.25rem,1.6rem+2.6vw,3.5rem)] leading-[1.08] font-medium tracking-[-0.025em] text-ink">
          {t("title")}
        </h1>
        <p className="measure text-xl text-muted">{t("lead")}</p>
        <div className="grid gap-3">
          <a
            href="tel:112"
            className="inline-flex min-h-16 w-full items-center justify-center gap-3 rounded-lg bg-danger px-8 text-2xl font-bold text-white shadow-raised hover:bg-danger-strong focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus sm:w-fit"
          >
            <Phone aria-hidden className="size-7" />
            {t("call")}
          </a>
          <a
            href="tel:108"
            className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-lg border-2 border-danger bg-surface px-8 text-xl font-bold text-danger-strong hover:bg-danger-surface focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus sm:w-fit"
          >
            <Phone aria-hidden className="size-6" />
            {t("callAmbulance")}
          </a>
          <p className="text-base text-muted">{t("callHint")}</p>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-12">
        <section aria-labelledby="steps" className="lg:col-span-7">
          <h2 id="steps" className="font-display text-2xl font-medium text-ink">
            {t("stepsTitle")}
          </h2>
          <ol className="mt-4 grid border-t border-border">
            {STEPS.map((k, i) => (
              <li key={k} className="grid grid-cols-[2.5rem_1fr] border-b border-border py-4 text-lg text-ink">
                <span aria-hidden className="font-display text-forest tabular">
                  {i + 1}
                </span>
                {t(`steps.${k}`)}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-muted">{t("disclaimer")}</p>
        </section>
        <div className="lg:col-span-4 lg:col-start-9">
          <GateNotice feature="emergencyDispatch" title={t("dispatchTitle")}>
            {t("dispatchBody")}
          </GateNotice>
        </div>
      </div>
    </Container>
  );
}

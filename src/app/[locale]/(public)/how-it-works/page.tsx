import { Phone } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ArrowLink, Container, PublicPageIntro } from "@/components/public/layout";
import { publicPageMetadata } from "@/components/public/metadata";
import { Link } from "@/i18n/navigation";

export function generateMetadata() {
  return publicPageMetadata("howItWorks", "/how-it-works");
}

const PATIENT = ["pin", "choose", "account", "request", "accept", "visit"] as const;
const PROVIDER = ["apply", "documents", "review", "publish", "requests"] as const;
const FACTS = [
  { id: "payment", title: "paymentTitle", body: "paymentBody" },
  { id: "cancellation", title: "cancelTitle", body: "cancelBody" },
  { id: "verification", title: "verificationTitle", body: "verificationBody" },
] as const;

function Steps({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-6 lg:grid-cols-12">
      <h2 id={id} className="font-display text-2xl font-medium text-ink lg:col-span-4">
        {title}
      </h2>
      <ol className="grid border-t border-border lg:col-span-7 lg:col-start-6">{children}</ol>
    </section>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="grid grid-cols-[2.5rem_1fr] gap-x-2 gap-y-1 border-b border-border py-5">
      <span aria-hidden className="row-span-2 font-display text-xl text-forest tabular">
        {n}
      </span>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="text-base text-muted">{body}</p>
    </li>
  );
}

export default function HowItWorksPage() {
  const t = useTranslations("public.howItWorks");
  return (
    <>
      <PublicPageIntro title={t("title")} lead={t("lead")}>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <a href="#patients">{t("patientTitle")}</a>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <a href="#providers">{t("providerTitle")}</a>
          </Button>
        </div>
      </PublicPageIntro>
      <Container className="grid gap-16 pb-20">
        <Steps id="patients" title={t("patientTitle")}>
          {PATIENT.map((k, i) => (
            <Step key={k} n={i + 1} title={t(`patient.${k}.title`)} body={t(`patient.${k}.body`)} />
          ))}
        </Steps>

        <div id="providers" className="scroll-mt-24">
          <Steps id="providers-title" title={t("providerTitle")}>
            {PROVIDER.map((k, i) => (
              <Step key={k} n={i + 1} title={t(`provider.${k}.title`)} body={t(`provider.${k}.body`)} />
            ))}
          </Steps>
          <div className="mt-6 lg:ml-[calc((5/12)*100%)]">
            <ArrowLink href="/become-a-provider">{t("provider.apply.title")}</ArrowLink>
          </div>
        </div>

        <div className="grid gap-10 rounded-lg bg-mist p-6 sm:p-10 md:grid-cols-3">
          {FACTS.map((f) => (
            <section key={f.id} id={f.id} aria-labelledby={`${f.id}-title`} className="grid content-start gap-2 scroll-mt-24">
              <h2 id={`${f.id}-title`} className="text-xl font-semibold text-ink">
                {t(f.title)}
              </h2>
              <p className="text-base text-ink/85">{t(f.body)}</p>
            </section>
          ))}
        </div>

        <section aria-labelledby="emergency-title" className="flex flex-col gap-4 rounded-lg border border-danger/30 bg-danger-surface p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-1">
            <h2 id="emergency-title" className="flex items-center gap-2 text-xl font-semibold text-danger">
              <Phone aria-hidden className="size-5" />
              {t("emergencyTitle")}
            </h2>
            <p className="text-base text-ink">{t("emergencyBody")}</p>
          </div>
          <Button asChild variant="danger">
            <Link href="/emergency">{t("emergencyCta")}</Link>
          </Button>
        </section>
      </Container>
    </>
  );
}

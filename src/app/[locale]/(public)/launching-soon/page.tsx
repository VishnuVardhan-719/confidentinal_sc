import type { Metadata } from "next";
import { ArrowRight, Phone } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Container, PublicPageIntro } from "@/components/public/layout";
import { pageMetadata } from "@/components/public/seo";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { HOLDING_PATH } from "@/lib/launch-mode";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("public.prelaunch");
  const locale = (await getLocale()) as AppLocale;
  return pageMetadata({ locale, path: HOLDING_PATH, title: t("title"), description: t("lead"), noindex: true });
}

/**
 * Holding page for everything that is closed in pre-launch mode (src/lib/launch-mode.ts). The proxy serves it
 * with HTTP 503 and noindex, so crawlers treat the closed routes as temporarily unavailable.
 */
export default async function LaunchingSoonPage() {
  const t = await getTranslations("public.prelaunch");
  return (
    <>
      <PublicPageIntro title={t("title")} lead={t("lead")} />
      <Container className="grid gap-8 pb-24">
        <p className="max-w-2xl text-lg text-muted">{t("body")}</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/">
              {t("home")}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/how-it-works">{t("how")}</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/contact">{t("contact")}</Link>
          </Button>
        </div>
        <p className="inline-flex items-center gap-2 font-medium text-ink">
          <Phone aria-hidden className="size-4" />
          {t("emergency")}
        </p>
      </Container>
    </>
  );
}

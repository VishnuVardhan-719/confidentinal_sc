import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/shared/footer";
import { PublicHeader } from "@/components/shared/public-header";
import { MAIN_CONTENT_ID } from "@/components/shared/skip-link";
import { Link } from "@/i18n/navigation";

/** Localized 404 for unknown routes and notFound() calls under /{locale}. */
export default function LocaleNotFound() {
  const t = useTranslations("errors.notFound");
  return (
    <>
      <title>{t("metaTitle")}</title>
      <PublicHeader />
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 outline-none">
        <div className="mx-auto grid max-w-content gap-6 px-4 py-20 sm:px-6 md:py-28 lg:px-8">
          <p aria-hidden className="font-display text-display leading-none text-forest/25 tabular">404</p>
          <h1 className="font-display text-3xl font-medium tracking-[-0.02em] text-ink">{t("title")}</h1>
          <p className="measure text-lg text-muted">{t("body")}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/">{t("home")}</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/faq">{t("help")}</Link>
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

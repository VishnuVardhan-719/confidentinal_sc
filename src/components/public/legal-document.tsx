import { FileClock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/shared/notice";
import { Container, PublicPageIntro } from "./layout";

export const LEGAL_SECTIONS = {
  privacy: ["collect", "use", "share", "rights", "security", "contact"],
  terms: ["marketplace", "accounts", "bookings", "providers", "emergencies", "liability"],
  refunds: ["beforeAccept", "afterAccept", "providerCancel", "refunds", "payAfter"],
} as const;

export type LegalDoc = keyof typeof LEGAL_SECTIONS;

/**
 * Legal pages stay clearly marked as drafts until the client's legal advisers approve the text.
 * They outline scope only: no invented entity, policy terms, fees or timelines.
 */
export function LegalDocument({ doc }: { doc: LegalDoc }) {
  const t = useTranslations("public.legal");
  return (
    <>
      <PublicPageIntro title={t(`${doc}.title`)} lead={t(`${doc}.lead`)}>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="warning">
            <FileClock aria-hidden />
            {t("draftBadge")}
          </Badge>
          <p className="text-sm text-muted">{t("version")}</p>
        </div>
      </PublicPageIntro>
      <Container className="grid gap-10 pb-20 lg:grid-cols-12">
        <div className="grid content-start gap-4 lg:col-span-4">
          <Notice tone="warning" title={t("draftTitle")}>
            {t("draftBody")}
          </Notice>
          <p className="text-sm text-muted">{t("entity")}</p>
        </div>
        <section aria-labelledby="legal-contents" className="lg:col-span-7 lg:col-start-6">
          <h2 id="legal-contents" className="font-display text-2xl font-medium text-ink">
            {t("contents")}
          </h2>
          <ol className="mt-6 grid border-t border-border">
            {LEGAL_SECTIONS[doc].map((key, i) => (
              <li key={key} className="grid gap-1 border-b border-border py-5 sm:grid-cols-[2.5rem_1fr]">
                <span aria-hidden className="font-display text-lg text-forest tabular">
                  {i + 1}
                </span>
                <div className="grid gap-1">
                  <h3 className="text-lg font-semibold text-ink">
                    {/* Dynamic key per document; the section lists above mirror the JSON. */}
                    {t(`${doc}.sections.${key}.title` as Parameters<typeof t>[0])}
                  </h3>
                  <p className="text-base text-muted">{t(`${doc}.sections.${key}.body` as Parameters<typeof t>[0])}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </Container>
    </>
  );
}

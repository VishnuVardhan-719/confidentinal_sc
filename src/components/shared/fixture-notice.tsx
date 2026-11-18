import { useTranslations } from "next-intl";
import { Notice } from "./notice";

/** Required on every screen rendering fixture-adapter data (CONVENTIONS: data honesty). */
export function FixtureNotice({ className }: { className?: string }) {
  const t = useTranslations("common.fixture");
  return (
    <Notice tone="warning" icon="fixture" title={t("title")} className={className} data-fixture-notice="">
      {t("body")}
    </Notice>
  );
}

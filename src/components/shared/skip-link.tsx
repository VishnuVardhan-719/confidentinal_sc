import { useTranslations } from "next-intl";

export const MAIN_CONTENT_ID = "main-content";

export function SkipLink() {
  const t = useTranslations("accessibility");
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="fixed top-2 left-2 z-[100] -translate-y-24 rounded-md bg-forest px-4 py-3 font-semibold text-on-forest shadow-overlay focus:translate-y-0 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {t("skipToContent")}
    </a>
  );
}

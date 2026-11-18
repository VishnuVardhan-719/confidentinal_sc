import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { DEFAULT_LOCALE, isAppLocale } from "./routing";
import { loadMessages } from "./messages";

export default getRequestConfig(async ({ locale: override }) => {
  // next/root-params is unavailable in Route Handlers / Server Actions; callers pass `locale` there.
  const requested = override ?? (await rootLocale());
  const locale = isAppLocale(requested) ? requested : DEFAULT_LOCALE;
  return {
    locale,
    timeZone: "Asia/Kolkata",
    messages: await loadMessages(locale),
  };
});

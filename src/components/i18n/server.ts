import { cookies } from "next/headers";
import { LOCALE_COOKIE, getMessages, toLocale, type Locale, type Messages } from "./config";

/**
 * Current locale from the cookie. Reading cookies makes the caller dynamic, so with
 * cacheComponents on, render anything that calls this inside <Suspense> with an English fallback.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return toLocale(store.get(LOCALE_COOKIE)?.value);
}

export async function getLocaleMessages(): Promise<{ locale: Locale; messages: Messages }> {
  const locale = await getLocale();
  return { locale, messages: getMessages(locale) };
}

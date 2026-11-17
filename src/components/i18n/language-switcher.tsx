import { Suspense } from "react";
import { setLocale } from "./actions";
import { DEFAULT_LOCALE, LOCALES, LOCALE_NAMES, getMessages, type Locale } from "./config";
import { HtmlLang } from "./html-lang";
import { getLocale } from "./server";
import "./i18n.css";

/**
 * English / Telugu / Hindi switcher. A real <form> with one submit button per language,
 * so it works by keyboard, screen reader and without JavaScript. The current language is
 * marked with aria-current; each button is labelled in its own language and script.
 */
function SwitcherForm({ current }: { current: Locale | null }) {
  const msgs = getMessages(current ?? DEFAULT_LOCALE);
  return (
    <form action={setLocale} className="i18n-switcher" aria-label={msgs.language.change}>
      <span className="i18n-label" lang={current ?? DEFAULT_LOCALE} aria-hidden="true">
        {msgs.language.label}
      </span>
      <div className="i18n-options">
        {LOCALES.map((l) => (
          <button
            key={l}
            type="submit"
            name="locale"
            value={l}
            lang={l}
            className="i18n-option"
            aria-current={current === l ? "true" : undefined}
          >
            {LOCALE_NAMES[l]}
          </button>
        ))}
      </div>
      {current && current !== "en" ? (
        <p className="i18n-partial" lang={current} role="status">
          {msgs.language.partial}
        </p>
      ) : null}
    </form>
  );
}

async function CurrentSwitcher() {
  const locale = await getLocale();
  return (
    <>
      <HtmlLang locale={locale} />
      <SwitcherForm current={locale} />
    </>
  );
}

/** Drop-in switcher. The fallback is a working form with no current marker until the cookie is read. */
export function LanguageSwitcher() {
  return (
    <Suspense fallback={<SwitcherForm current={null} />}>
      <CurrentSwitcher />
    </Suspense>
  );
}

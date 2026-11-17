import { setLocale } from "./actions";
import { LOCALES, LOCALE_NAMES, getMessages, type Locale } from "./config";
import "./i18n.css";

type Variant = "full" | "compact";

/**
 * English / Telugu / Hindi switcher. A real <form> with one submit button per language,
 * so it works by keyboard, screen reader and without JavaScript. The current language is
 * marked with aria-current; each button is labelled in its own language and script.
 * Callers pass the locale they already read (header/footer read the cookie once, inside Suspense).
 * `compact` hides the visible "Language" label and the partial-translation note.
 */
export function LanguageSwitcher({ current, variant = "full" }: { current: Locale | null; variant?: Variant }) {
  const msgs = getMessages(current ?? "en");
  return (
    <form action={setLocale} className="i18n-switcher" data-variant={variant} aria-label={msgs.language.change}>
      <span className={variant === "compact" ? "visually-hidden" : "i18n-label"} aria-hidden="true">
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
      {variant === "full" && current && current !== "en" ? (
        <p className="i18n-partial">{msgs.language.partial}</p>
      ) : null}
    </form>
  );
}

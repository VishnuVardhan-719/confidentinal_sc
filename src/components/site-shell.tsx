import Link from "next/link";
import { Suspense } from "react";
import { AccountActions } from "./account-actions";
import { HeaderNav } from "./nav-links";
import { footerGroups, headerLinks } from "./site-links";
import { getMessages, splitAt, type Locale, type Messages } from "./i18n/config";
import { LanguageSwitcher } from "./i18n/language-switcher";
import { getLocale } from "./i18n/server";
import "./site-shell.css";

/*
 * Site header and footer. Both read the language cookie, so under cacheComponents each renders a static
 * English version first (the Suspense fallback, part of the prerendered shell) and streams the chosen
 * language in the same response. The account links are a client component: the session is per browser tab.
 *
 * Translated chrome carries its own lang attribute. <html lang> stays "en" because page bodies are
 * still English; marking the whole document Telugu or Hindi would make screen readers read English
 * content with the wrong voice.
 */

const EN = getMessages("en");

function Brand({ as: Tag = "span" }: { as?: "span" | "p" }) {
  return (
    <Tag className="brand" lang="en">
      SureCure <em>Visit</em>
    </Tag>
  );
}

function EmergencyCall({ m }: { m: Messages }) {
  const [before, after] = splitAt(m.footer.emergencyCall, "phone");
  return (
    <>
      {before}
      <a className="sh-tel" href="tel:112">
        112
      </a>
      {after}
    </>
  );
}

function HeaderBody({ locale }: { locale: Locale | null }) {
  const m = getMessages(locale ?? "en");
  const n = m.nav;
  return (
    <header className="site-header" lang={locale ?? "en"}>
      <div className="sh-utility">
        <div className="frame sh-utility-inner">
          <p className="sh-emergency">
            <EmergencyCall m={m} />
          </p>
          <LanguageSwitcher current={locale} variant="compact" />
        </div>
      </div>
      <div className="frame sh-row">
        <Link className="sh-brand-link" href="/" aria-label="SureCure Visit home">
          <Brand />
        </Link>
        <HeaderNav items={headerLinks(m.nav)} label={m.nav.main} menuLabel={m.nav.menu}>
          <AccountActions
            labels={{ signIn: n.signIn, createAccount: n.createAccount, dashboard: n.dashboard, signOut: n.signOut }}
          />
        </HeaderNav>
      </div>
    </header>
  );
}

async function LiveHeader() {
  return <HeaderBody locale={await getLocale()} />;
}

export function SiteHeader() {
  return (
    <Suspense fallback={<HeaderBody locale={null} />}>
      <LiveHeader />
    </Suspense>
  );
}

function FooterBody({ locale }: { locale: Locale | null }) {
  const m = locale ? getMessages(locale) : EN;
  return (
    <footer className="site-footer" lang={locale ?? "en"}>
      <div className="frame sh-foot">
        <div className="sh-foot-brand">
          <Brand as="p" />
          <p className="footer-note">
            {m.footer.tagline} {m.footer.bookingNotOpen}
          </p>
          <LanguageSwitcher current={locale} />
        </div>
        <nav className="sh-foot-nav" aria-label={m.nav.footer}>
          {footerGroups(m).map((g) => (
            <div key={g.id}>
              <h2 className="sh-foot-title" id={`footer-${g.id}`}>
                {g.title}
              </h2>
              <ul aria-labelledby={`footer-${g.id}`}>
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <p className="emergency-note">
          <EmergencyCall m={m} /> {m.footer.emergencyNote}
        </p>
      </div>
    </footer>
  );
}

async function LiveFooter() {
  return <FooterBody locale={await getLocale()} />;
}

export function SiteFooter() {
  return (
    <Suspense fallback={<FooterBody locale={null} />}>
      <LiveFooter />
    </Suspense>
  );
}

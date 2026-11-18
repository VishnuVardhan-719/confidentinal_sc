import Link from "next/link";
import { Suspense } from "react";
import { ButtonLink } from "./button-link";
import { HeaderNav } from "./nav-links";
import { SIGN_IN_HREF, SIGN_UP_HREF, footerGroups, headerLinks } from "./site-links";
import { Button } from "./ui/button";
import { getMessages, splitAt, type Locale, type Messages } from "./i18n/config";
import { LanguageSwitcher } from "./i18n/language-switcher";
import { getLocale } from "./i18n/server";
import { endDemoSession } from "@/lib/demo/auth-actions";
import { getDemoSession, type DemoSession } from "@/lib/demo/auth";
import "./site-shell.css";

/*
 * Site header and footer. Both read cookies (language, demo session), so under cacheComponents each
 * renders a static English guest version first (the Suspense fallback, part of the prerendered shell)
 * and streams the personalised one in the same response.
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

/** Exported for tests. */
export function AccountActions({ m, session }: { m: Messages; session: DemoSession | null }) {
  const n = m.nav;
  if (!session) {
    return (
      <div className="sh-actions">
        <Link className="sh-signin" href={SIGN_IN_HREF}>
          {n.signIn}
        </Link>
        <ButtonLink href={SIGN_UP_HREF}>{n.createAccount}</ButtonLink>
      </div>
    );
  }
  const [before, after] = splitAt(m.demo.signedInAs, "role");
  return (
    <div className="sh-actions">
      <span className="sh-demo">
        {before}
        {m.roles[session.role]}
        {after}
      </span>
      <ButtonLink href={session.home}>{n.dashboard}</ButtonLink>
      <form action={endDemoSession}>
        <Button type="submit" variant="secondary" className="w-full">
          {n.signOut}
        </Button>
      </form>
    </div>
  );
}

function HeaderBody({ locale, session }: { locale: Locale | null; session: DemoSession | null }) {
  const m = getMessages(locale ?? "en");
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
          <AccountActions m={m} session={session} />
        </HeaderNav>
      </div>
    </header>
  );
}

async function LiveHeader() {
  const [locale, session] = await Promise.all([getLocale(), getDemoSession()]);
  return <HeaderBody locale={locale} session={session} />;
}

export function SiteHeader() {
  return (
    <Suspense fallback={<HeaderBody locale={null} session={null} />}>
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

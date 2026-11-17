import type { Metadata } from "next";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { LocaleScript } from "@/components/i18n/locale-script";
import { SITE_URL } from "@/components/marketing/site";
import "@/components/marketing/marketing.css";

// Route group for the public information pages. The root layout already renders the header, main and footer.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
};

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {/* Interim placement until the shared header (site-shell.tsx) takes the switcher and the script moves to the root layout. */}
      <LocaleScript />
      <div className="frame flex justify-end pt-4">
        <LanguageSwitcher />
      </div>
      {/* These pages are English only so far; marking them keeps screen readers on an English voice whatever the UI language. */}
      <div lang="en">{children}</div>
    </>
  );
}

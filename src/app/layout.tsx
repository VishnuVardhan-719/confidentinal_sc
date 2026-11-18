import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Newsreader } from "next/font/google";
import { SiteHeader, SiteFooter } from "@/components/site-shell";
import "./globals.css";

// Body: built for low-vision legibility. Display: an optical-size serif for the editorial voice.
// Telugu and Devanagari web fonts are added with the i18n ticket; system Noto/Nirmala fallbacks cover them until then.
// next/font has no fallback metrics for this family; the metric-matched fallback is declared in globals.css.
const body = Atkinson_Hyperlegible_Next({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Atkinson Metric Fallback", "Arial", "sans-serif"],
});

const editorial = Newsreader({
  variable: "--font-editorial",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "SureCure Visit", template: "%s | SureCure Visit" },
  description:
    "Explore doctor visits, lab services, scheduled ambulance transport and non-clinical caretaker support with SureCure Visit.",
};

export const viewport: Viewport = {
  themeColor: "#faf8f2",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${body.variable} ${editorial.variable}`}>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <SiteHeader />
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}

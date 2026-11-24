import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { locale as rootLocale } from "next/root-params";
import { SHARE_IMAGE, SITE_URL, TWITTER_IMAGE } from "@/components/public/seo";
import { SkipLink } from "@/components/shared/skip-link";
import { ToastProvider } from "@/components/ui/toast";
import { CLIENT_NAMESPACES, pickNamespaces } from "@/i18n/messages";
import { LOCALES, isAppLocale } from "@/i18n/routing";
import { fontVariables } from "@/styles/fonts";
import "../globals.css";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.meta");
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("defaultTitle"), template: t("titleTemplate") },
    description: t("defaultDescription"),
    applicationName: "SureCure Visit",
    formatDetection: { telephone: false },
    category: "health",
    keywords: [
      "SureCure Visit",
      "SureCureVisit",
      "healthcare at your doorstep",
      "doctor home visit",
      "home lab test sample collection",
      "ambulance transport",
      "caretaker at home",
    ],
    // Search Console / Bing tokens are read from the environment so they never live in the repo.
    verification: {
      google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
      other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
    },
    openGraph: { siteName: "SureCure Visit", type: "website", images: [SHARE_IMAGE] },
    twitter: { card: "summary_large_image", images: [TWITTER_IMAGE] },
  };
}

export const viewport: Viewport = {
  themeColor: "#faf8f2",
  colorScheme: "light",
};

export default async function LocaleLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await rootLocale();
  if (!isAppLocale(locale)) notFound();
  const messages = await getMessages();

  return (
    <html lang={locale} className={fontVariables}>
      <body className="flex min-h-dvh flex-col">
        <NextIntlClientProvider messages={pickNamespaces(messages, CLIENT_NAMESPACES)}>
          <ToastProvider>
            <SkipLink />
            {children}
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { Footer } from "@/components/shared/footer";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { PublicHeader } from "@/components/shared/public-header";
import { MAIN_CONTENT_ID } from "@/components/shared/skip-link";
import { CLIENT_NAMESPACES, pickNamespaces } from "@/i18n/messages";

/** Sign-in/sign-up pages: public chrome plus the `auth` messages for the client islands. */
export default async function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={pickNamespaces(messages, [...CLIENT_NAMESPACES, "auth"])}>
      <PublicHeader />
      <OfflineBanner className="mx-auto w-full max-w-content px-4 empty:hidden sm:px-6 lg:px-8 [&>*]:mt-3" />
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <Footer />
    </NextIntlClientProvider>
  );
}

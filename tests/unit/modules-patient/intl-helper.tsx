import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

/** Intl provider for fe-p view tests: a given locale and message set; missing keys throw. */
export function intlTree(ui: ReactNode, locale: "en" | "te" | "hi", messages: Record<string, unknown>) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone="Asia/Kolkata"
      onError={(e) => {
        throw e;
      }}
    >
      {ui}
    </NextIntlClientProvider>
  );
}

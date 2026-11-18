import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { CLIENT_NAMESPACES, pickNamespaces } from "@/i18n/messages";

/** Ships the booking namespace to client islands under it (the root provider only carries common/errors/accessibility). */
export async function BookingIntl({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return <NextIntlClientProvider messages={pickNamespaces(messages, [...CLIENT_NAMESPACES, "booking"] as const)}>{children}</NextIntlClientProvider>;
}

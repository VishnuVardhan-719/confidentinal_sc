import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { CLIENT_NAMESPACES, pickNamespaces, type Namespace } from "@/i18n/messages";

/**
 * Server component that makes extra message namespaces available to the client islands below it
 * (only common/errors/accessibility are shipped globally). Wrap the smallest subtree that needs them:
 *
 *   <IntlScope namespaces={["payment"]}><CancellationDialog ... /></IntlScope>
 */
export async function IntlScope({ namespaces, children }: { namespaces: readonly Namespace[]; children: ReactNode }) {
  const messages = await getMessages();
  const keys = Array.from(new Set<Namespace>([...CLIENT_NAMESPACES, ...namespaces]));
  return <NextIntlClientProvider messages={pickNamespaces(messages, keys)}>{children}</NextIntlClientProvider>;
}

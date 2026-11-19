import type { ReactNode } from "react";
import { IntlScope } from "@/components/shared/intl-scope";

/** Makes the `services` messages available to this tree's client islands, including its error boundaries. */
export default function Layout({ children }: { children: ReactNode }) {
  return <IntlScope namespaces={["services"]}>{children}</IntlScope>;
}

import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/shared/status-badge";

/** Module status descriptor (src/modules/<area>/status.ts): a message key, a tone, and whether it is known. */
export type ModuleStatus = { readonly labelKey: string; readonly tone: "neutral" | "info" | "success" | "warning" | "danger"; readonly known: boolean };

/**
 * Renders a module status through the shared StatusBadge. Unknown statuses use
 * the neutral "help" icon so they can never look approved/active/released.
 */
export function OpsStatus({ status, className }: { status: ModuleStatus; className?: string }) {
  const t = useTranslations();
  // labelKey comes from a canonical status map; next-intl's key union cannot express it statically.
  const label = t(status.labelKey as Parameters<typeof t>[0]);
  return <StatusBadge tone={status.known ? status.tone : "neutral"} icon={status.known ? undefined : "help"} label={label} className={className} />;
}

/** Translate a module-provided message key (status maps, reason codes). */
export function useKeyTranslator() {
  const t = useTranslations();
  return (key: string, values?: Record<string, string | number>) => t(key as Parameters<typeof t>[0], values as never);
}

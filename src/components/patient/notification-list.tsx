import { BellRing, CalendarCheck, CalendarX, FileText, Wallet, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/shared/status-badge";
import { getClinicalFormat } from "@/components/clinical/server-format";
import { cn } from "@/components/ui/cn";
import { Link } from "@/i18n/navigation";
import type { NotificationKind, PatientNotification } from "@/modules/notifications";

const ICON: Record<NotificationKind, LucideIcon> = {
  booking_accepted: CalendarCheck,
  booking_declined: CalendarX,
  visit_reminder: BellRing,
  record_ready: FileText,
  payment_due: Wallet,
};

/** Text comes only from localized templates keyed by kind (no server free text, no PHI). */
export async function NotificationList({ items, label }: { items: PatientNotification[]; label: string }) {
  const [t, f] = await Promise.all([getTranslations("patient.notifications"), getClinicalFormat()]);
  return (
    <ul className="grid gap-3" aria-label={label}>
      {items.map((n) => {
        const Icon = ICON[n.kind];
        const ref = n.bookingReference ?? t("noReference");
        return (
          <li key={n.id} className={cn("flex gap-3 rounded-lg border bg-surface p-4", n.readAt ? "border-border" : "border-forest/50")}>
            <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-forest" />
            <div className="grid min-w-0 flex-1 gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{f.tk(`patient.notifications.kind.${n.kind}.title`)}</p>
                {n.readAt ? null : <StatusBadge tone="brand" icon="dot" label={t("unread")} />}
              </div>
              <p className="text-sm text-ink">{f.tk(`patient.notifications.kind.${n.kind}.body`, { reference: ref })}</p>
              <p className="text-sm text-muted tabular">
                <time dateTime={n.createdAt}>{f.dateTime(n.createdAt)}</time>
              </p>
              {n.href ? (
                <Link href={n.href} className="inline-flex min-h-target items-center text-forest underline underline-offset-4">
                  {f.tk(`patient.notifications.kind.${n.kind}.action`)}
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

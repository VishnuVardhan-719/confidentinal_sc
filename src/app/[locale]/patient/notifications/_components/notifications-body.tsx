import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { GateNotice } from "@/components/shared/gate-notice";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { RetryAction } from "@/components/shared/retry-action";
import type { NotificationView } from "@/components/notifications/notifications";
import { NotificationsInbox } from "@/components/patient/notifications-inbox";
import { Link } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import { notificationSchema } from "@/modules/notifications/schemas";

/**
 * Inbox body below the page header: gated, denied, error, malformed and ready (including empty, which
 * NotificationList renders). Each item shows only the event kind and time (no health details) and
 * links to the authorized booking page when the server names one. A list that fails the schema is
 * shown as an error as a whole, never partially. `unauthenticated` never reaches here (the page
 * redirects to login).
 */
export function NotificationsBody({
  result,
  markRead,
  dashboardAction,
}: {
  result: ApiResult<{ items: unknown[] }>;
  markRead: (id: string, expectedVersion: number) => Promise<ApiResult<{ version: number }>>;
  /** "Back to overview" button (an async server component, passed in by the page). */
  dashboardAction: ReactNode;
}) {
  const t = useTranslations("patient.notifications");
  if (!result.ok) {
    const code = result.error.code;
    if (code === "gated") {
      return (
        <GateNotice
          reason="contract_pending"
          title={t("state.gatedTitle")}
          action={
            <Button asChild variant="secondary">
              <Link href="/patient/bookings">{t("state.gatedAction")}</Link>
            </Button>
          }
        >
          {t("state.gated")}
        </GateNotice>
      );
    }
    if (code === "forbidden" || code === "not_found") return <Notice tone="neutral" icon="lock" title={t("state.denied")} action={dashboardAction} />;
    return <InlineError code={code} action={code === "unavailable" || code === "rate_limited" ? <RetryAction /> : undefined} />;
  }
  const valid = z.array(notificationSchema).safeParse(result.data.items);
  if (!valid.success) return <InlineError code="unavailable" action={<RetryAction />} />;
  const items: NotificationView[] = valid.data.map((n) => ({
    id: n.id,
    kind: n.kind,
    occurredAt: n.occurredAt,
    read: n.readAt !== null,
    href: n.bookingId ? `/patient/bookings/${n.bookingId}` : null,
  }));
  const versions = Object.fromEntries(valid.data.map((n) => [n.id, n.version]));
  return <NotificationsInbox items={items} versions={versions} markRead={markRead} />;
}

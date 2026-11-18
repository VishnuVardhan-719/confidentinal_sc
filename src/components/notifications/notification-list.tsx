"use client";

import { Bell, Check } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/shared/empty-state";
import { InlineError } from "@/components/shared/inline-error";
import type { ViewState } from "@/components/shared/view-state";
import { ViewStateFallback } from "@/components/shared/view-state-fallback";
import { Link } from "@/i18n/navigation";
import { applyReadState, isInternalPath, NOTIFICATION_KINDS, type NotificationKind, type NotificationView } from "./notifications";

export type MarkReadResult = { ok: true } | { ok: false; code?: string };

/**
 * Notification inbox. Shows only the event kind and time (no health details), optional link to the
 * authorized page, and an unread marker with text. "Mark as read" is optimistic and rolls back if
 * the server refuses. Messages live in `common.notifications`, so no IntlScope is needed.
 */
export function NotificationList({
  view,
  onMarkRead,
}: {
  view: ViewState<NotificationView[]>;
  onMarkRead?: (id: string) => Promise<MarkReadResult>;
}) {
  return (
    <ViewStateFallback view={view}>
      {(items) => <List initial={items} onMarkRead={onMarkRead} />}
    </ViewStateFallback>
  );
}

function List({ initial, onMarkRead }: { initial: NotificationView[]; onMarkRead?: (id: string) => Promise<MarkReadResult> }) {
  const t = useTranslations("common.notifications");
  const format = useFormatter();
  const headingId = useId();
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const items = applyReadState(initial, overrides);
  const unread = items.filter((n) => !n.read).length;

  async function markRead(id: string) {
    if (!onMarkRead || pendingId) return;
    setErrorCode(null);
    setPendingId(id);
    setOverrides((o) => ({ ...o, [id]: true }));
    try {
      const res = await onMarkRead(id);
      if (!res.ok) {
        setOverrides((o) => ({ ...o, [id]: false }));
        setErrorCode(res.code ?? "generic");
      }
    } catch {
      setOverrides((o) => ({ ...o, [id]: false }));
      setErrorCode("unavailable");
    } finally {
      setPendingId(null);
    }
  }

  if (items.length === 0) {
    return <EmptyState icon="inbox" title={t("emptyTitle")} description={t("emptyBody")} />;
  }

  return (
    <section aria-labelledby={headingId} className="grid gap-4">
      <h2 id={headingId} className="flex items-center gap-2 text-lg font-semibold text-ink">
        <Bell aria-hidden className="size-5 text-forest" />
        {t("title")}
        <span className="text-base font-normal text-muted">({t("unread", { count: unread })})</span>
      </h2>
      {errorCode ? <InlineError code={errorCode} /> : null}
      <ul className="grid divide-y divide-border rounded-lg border border-border bg-surface">
        {items.map((n) => {
          const kind: NotificationKind | "unknown" = (NOTIFICATION_KINDS as readonly string[]).includes(n.kind) ? (n.kind as NotificationKind) : "unknown";
          const date = new Date(n.occurredAt);
          return (
            <li key={n.id} className={cn("flex flex-wrap items-start gap-3 p-4", !n.read && "bg-mist/50")}>
              <span aria-hidden className={cn("mt-2 size-2.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-forest")} />
              <div className="grid min-w-0 flex-1 gap-0.5">
                <p className={cn("text-base text-ink", !n.read && "font-semibold")}>
                  {!n.read ? <span className="sr-only">{t("unreadMarker")} </span> : null}
                  {t(`kinds.${kind}`)}
                </p>
                {Number.isNaN(date.getTime()) ? null : (
                  <time dateTime={n.occurredAt} className="text-sm text-muted tabular">
                    {format.dateTime(date, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}
                  </time>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isInternalPath(n.href) ? (
                  <Button asChild variant="quiet">
                    <Link href={n.href as string}>{t("open")}</Link>
                  </Button>
                ) : null}
                {!n.read && onMarkRead ? (
                  <Button variant="secondary" onClick={() => markRead(n.id)} disabled={pendingId !== null} aria-busy={pendingId === n.id}>
                    <Check aria-hidden />
                    {t("markRead")}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

import { ArrowUpRight, CircleDot, MessageSquare, RefreshCw } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyedStatusBadge } from "@/components/shared/status-badge";
import type { StatusPresentation } from "@/components/shared/status";
import type { ViewState } from "@/components/shared/view-state";
import { ViewStateFallback } from "@/components/shared/view-state-fallback";

export type TicketEventKind = "created" | "status_changed" | "message" | "escalated";
export type TicketActor = "you" | "provider" | "platform";

export type TicketEventView = {
  id: string;
  kind: TicketEventKind;
  actor: TicketActor;
  /** UTC ISO timestamp from the server; rendered in Asia/Kolkata. */
  at: string;
  /** Plain text only (never HTML). */
  message?: string;
  /** For status_changed: the module's canonical presentation of the new status. */
  statusPresentation?: StatusPresentation;
};

const ICONS = { created: CircleDot, status_changed: RefreshCw, message: MessageSquare, escalated: ArrowUpRight } as const;

/**
 * Chronological ticket history: who did what and when. Server component (status labels resolve
 * from any namespace). Oldest first; the page decides pagination.
 */
export function TicketTimeline({ view }: { view: ViewState<TicketEventView[]> }) {
  return (
    <ViewStateFallback view={view}>
      {(events) => <Timeline events={events} />}
    </ViewStateFallback>
  );
}

function Timeline({ events }: { events: TicketEventView[] }) {
  const t = useTranslations("support.timeline");
  const format = useFormatter();
  if (events.length === 0) return <EmptyState title={t("emptyTitle")} description={t("emptyBody")} headingLevel="h3" />;
  const sorted = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return (
    <ol className="relative grid gap-6 pl-8 before:absolute before:top-2 before:bottom-2 before:left-3 before:w-px before:bg-border">
      {sorted.map((e) => {
        const Icon = ICONS[e.kind] ?? CircleDot;
        const date = new Date(e.at);
        const valid = !Number.isNaN(date.getTime());
        return (
          <li key={e.id} className="relative grid gap-1">
            <span aria-hidden className="absolute top-0.5 -left-8 inline-flex size-6 items-center justify-center rounded-full border border-border bg-surface text-forest">
              <Icon className="size-3.5" />
            </span>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-ink">
              <span className="font-semibold">{t(`actor.${e.actor}`)}</span>
              <span>{t(`kind.${e.kind}`)}</span>
              {e.kind === "status_changed" ? <KeyedStatusBadge presentation={e.statusPresentation} /> : null}
            </p>
            {valid ? (
              <time dateTime={e.at} className="text-sm text-muted tabular">
                {format.dateTime(date, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}
              </time>
            ) : null}
            {e.message ? <p className="measure mt-1 rounded-md bg-paper p-3 text-base whitespace-pre-line text-ink">{e.message}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}

import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/shared/status-badge";
import { badgeFor } from "@/components/clinical/kit";
import { getClinicalFormat } from "@/components/clinical/server-format";
import { Link } from "@/i18n/navigation";
import { describeBookingState, describeVisitPhase } from "@/modules/doctor/status";
import type { AssignedVisitView, DoctorRequestView } from "@/modules/doctor/types";
import { requestRespondState } from "@/modules/doctor/loaders";

/** Dense, scannable visit rows (time first). Each row is one link; badges carry text, not only colour. */
export async function VisitList({ visits, label }: { visits: AssignedVisitView[]; label: string }) {
  const [{ tk, dateTime }, t] = await Promise.all([getClinicalFormat(), getTranslations("doctor.visits")]);
  return (
    <ul aria-label={label} className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
      {visits.map((v) => (
        <li key={v.bookingId}>
          <Link
            href={`/doctor/visits/${v.bookingId}`}
            className="group grid gap-2 px-4 py-4 hover:bg-paper focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-focus sm:grid-cols-[10rem_1fr_auto] sm:items-center sm:gap-4"
          >
            <span className="text-sm font-semibold text-ink tabular">{dateTime(v.scheduledStartAt)}</span>
            <span className="grid min-w-0 gap-0.5">
              <span className="truncate font-semibold text-ink">{v.patient.displayName}</span>
              <span className="truncate text-sm text-muted">
                {v.serviceName} · {v.address.locality}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <StatusBadge {...badgeFor(describeBookingState(v.state), tk)} />
              <StatusBadge {...badgeFor(describeVisitPhase(v.phase), tk)} />
              <ChevronRight aria-hidden className="hidden size-5 text-muted group-hover:text-forest sm:block" />
              <span className="sr-only">{t("open")}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Pre-accept request rows: coarse area, price snapshot and server respond-by only. */
export async function RequestList({ requests, label, now }: { requests: DoctorRequestView[]; label: string; now: Date }) {
  const [{ dateTime, money, time }, t] = await Promise.all([getClinicalFormat(), getTranslations("doctor.requests")]);
  return (
    <ul aria-label={label} className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
      {requests.map((r) => {
        const respond = requestRespondState(r, now);
        return (
          <li key={r.bookingId}>
            <Link
              href={`/doctor/requests/${r.bookingId}`}
              className="group grid gap-2 px-4 py-4 hover:bg-paper focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-focus sm:grid-cols-[10rem_1fr_auto] sm:items-center sm:gap-4"
            >
              <span className="text-sm font-semibold text-ink tabular">{dateTime(r.scheduledStartAt)}</span>
              <span className="grid min-w-0 gap-0.5">
                <span className="truncate font-semibold text-ink">{r.serviceName}</span>
                <span className="truncate text-sm text-muted">
                  {r.area.locality}, {r.area.pin} · {money(r.quotedAmountPaise)}
                </span>
              </span>
              <span className="flex items-center gap-2 text-sm text-muted tabular">
                {r.respondBy ? (respond.open ? t("respondBy", { time: time(r.respondBy) }) : t("respondClosed")) : t("noDeadline")}
                <ChevronRight aria-hidden className="hidden size-5 group-hover:text-forest sm:block" />
                <span className="sr-only">{t("open")}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

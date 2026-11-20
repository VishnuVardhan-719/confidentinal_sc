import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { PAYMENT_LABEL, STATE_LABEL, type BookingState } from "@/lib/client/booking";
import { dateParts, formatTime } from "@/lib/client/format";

const STATE_TONE: Partial<Record<BookingState, string>> = {
  requested: "border-[var(--warning)] bg-[var(--warning-surface)] text-[var(--warning)]",
  accepted: "border-[var(--forest)] bg-[var(--mist)] text-[var(--forest)]",
  confirmed: "border-[var(--forest)] bg-[var(--mist)] text-[var(--forest)]",
  in_progress: "border-[var(--forest)] bg-[var(--mist)] text-[var(--forest)]",
};
const QUIET = "border-[var(--line-strong)] bg-white text-[var(--ink-soft)]";

export function StatusPill({ state }: { state: BookingState }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap",
        STATE_TONE[state] ?? QUIET,
      )}
    >
      {STATE_LABEL[state]}
    </span>
  );
}

/** Date block + body + trailing slot. One row in a hairline list of visits or requests. */
export function VisitRow({
  startsAt,
  title,
  meta,
  state,
  actions,
  muted = false,
}: {
  startsAt: string;
  title: string;
  meta: ReactNode;
  state?: BookingState;
  actions?: ReactNode;
  muted?: boolean;
}) {
  const { weekday, day, month } = dateParts(startsAt);
  return (
    <li className="flex flex-wrap items-start gap-x-5 gap-y-3 border-b border-[var(--line)] py-5 sm:flex-nowrap">
      <time
        dateTime={startsAt}
        className={cx(
          "flex w-16 flex-none flex-col items-center rounded-md border py-2 leading-tight tabular-nums",
          muted ? "border-[var(--line)] text-[var(--ink-soft)]" : "border-[var(--forest)] text-[var(--forest)]",
        )}
      >
        <span className="text-[0.75rem] font-semibold uppercase">{weekday}</span>
        <span className="text-[1.25rem] font-bold">{day}</span>
        <span className="text-[0.75rem] font-semibold">{month}</span>
      </time>
      <div className="min-w-0 flex-1">
        <p className="font-semibold break-words text-[var(--ink)]">{title}</p>
        <div className="mt-1 text-[0.9375rem] break-words text-[var(--ink-soft)]">{meta}</div>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[0.875rem] text-[var(--ink-soft)]">
          {state ? <StatusPill state={state} /> : null}
          <span>{formatTime(startsAt)} IST</span>
          <span aria-hidden="true">·</span>
          <span>{PAYMENT_LABEL}</span>
        </p>
      </div>
      {actions ? <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-none">{actions}</div> : null}
    </li>
  );
}

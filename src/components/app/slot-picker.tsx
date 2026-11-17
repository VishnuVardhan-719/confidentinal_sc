"use client";

import { useId } from "react";
import { cx } from "@/components/ui/cx";
import { dayKey, formatDay, formatTime } from "./demo-model";

/**
 * Time slot picker: one native radio group, grouped by day (India time). Taken slots stay visible
 * but disabled, so people see why a time is missing.
 */
export function SlotPicker({
  slots,
  taken,
  value,
  onChange,
  error,
}: {
  slots: readonly string[];
  taken: ReadonlySet<string>;
  value: string | undefined;
  onChange: (slot: string) => void;
  error?: string;
}) {
  const id = useId();
  const days = new Map<string, string[]>();
  for (const s of [...slots].sort()) days.set(dayKey(s), [...(days.get(dayKey(s)) ?? []), s]);

  return (
    <fieldset aria-describedby={error ? `${id}-error` : undefined} className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-3 p-0 text-[0.9375rem] font-semibold">Time (India time, IST)</legend>
      <div className="grid gap-4">
        {[...days.entries()].map(([day, list]) => (
          <div key={day} className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
            <p className="text-[0.9375rem] font-semibold text-[var(--ink-soft)]">{formatDay(list[0]!)}</p>
            <div className="flex flex-wrap gap-2">
              {list.map((slot) => {
                const isTaken = taken.has(slot);
                const checked = value === slot;
                return (
                  <label
                    key={slot}
                    className={cx(
                      "inline-flex min-h-11 items-center gap-2 rounded-md border px-3.5 text-[0.9375rem] font-semibold tabular-nums",
                      "has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]",
                      isTaken
                        ? "cursor-not-allowed border-dashed border-[var(--line-strong)] text-[var(--ink-soft)]"
                        : checked
                          ? "cursor-pointer border-[var(--forest)] bg-[var(--forest)] text-[var(--paper)]"
                          : "cursor-pointer border-[var(--control-border)] bg-white text-[var(--ink)] hover:border-[var(--forest)]",
                    )}
                  >
                    <input
                      type="radio"
                      name="slot"
                      value={slot}
                      checked={checked}
                      disabled={isTaken}
                      onChange={() => onChange(slot)}
                      className="visually-hidden"
                    />
                    {formatTime(slot)}
                    {isTaken ? <span className="font-medium">· taken</span> : null}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm font-medium text-[var(--warning)]">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

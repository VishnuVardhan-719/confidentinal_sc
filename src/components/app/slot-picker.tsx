"use client";

import { useId } from "react";
import { cx } from "@/components/ui/cx";
import { formatTime } from "@/lib/client/format";

/**
 * Time picker for one day: one native radio group, so arrow keys move between times. Times come from
 * GET /api/availability and are advisory: the provider still accepts or declines the request.
 */
export function SlotPicker({
  slots,
  value,
  onChange,
  error,
  legend,
}: {
  slots: readonly string[];
  value: string | undefined;
  onChange: (slot: string) => void;
  error?: string;
  legend: string;
}) {
  const id = useId();
  return (
    <fieldset
      aria-describedby={error ? `${id}-error` : undefined}
      aria-invalid={error ? true : undefined}
      className="m-0 min-w-0 border-0 p-0"
    >
      <legend className="mb-3 p-0 text-[0.9375rem] font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {[...slots].sort().map((slot) => {
          const checked = value === slot;
          return (
            <label
              key={slot}
              className={cx(
                "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3.5 text-[0.9375rem] font-semibold tabular-nums",
                "has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]",
                checked
                  ? "border-[var(--forest)] bg-[var(--forest)] text-[var(--paper)]"
                  : "border-[var(--control-border)] bg-white text-[var(--ink)] hover:border-[var(--forest)]",
              )}
            >
              <input
                type="radio"
                name="slot"
                value={slot}
                checked={checked}
                onChange={() => onChange(slot)}
                className="visually-hidden"
              />
              {formatTime(slot)}
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm font-medium text-[var(--warning)]">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

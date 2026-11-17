"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Icon } from "./icons";
import { canOpenStep, type StepDef } from "./steps";

const focusRing = "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]";

/**
 * Step list for multi-step forms. Steps up to the furthest one reached are buttons, so people can go
 * back and change an answer. Later steps are plain text until the earlier ones are complete.
 * Each step has one spoken name ("Step 2 of 4: PIN and area, completed"); the visual parts are hidden from AT.
 */
export function Stepper({
  steps,
  current,
  furthest,
  onOpen,
  label,
}: {
  steps: readonly StepDef[];
  current: number;
  furthest: number;
  onOpen: (index: number) => void;
  label: string;
}) {
  return (
    <nav aria-label={label} className="mb-8">
      <p aria-hidden="true" className="mb-3 text-[0.9375rem] font-semibold text-[var(--ink-soft)] md:hidden">
        Step {current + 1} of {steps.length}: {steps[current]?.title}
      </p>
      <ol
        className="m-0 grid list-none gap-2 p-0"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((step, index) => {
          const isCurrent = index === current;
          const done = index < furthest && !isCurrent;
          const open = canOpenStep(index, furthest, steps.length);
          const state = isCurrent ? "current" : done ? "completed" : open ? "" : "not started";
          const spoken = `Step ${index + 1} of ${steps.length}: ${step.title}${state ? `, ${state}` : ""}`;
          const visual = (
            <>
              <span
                aria-hidden="true"
                className={cx(
                  "grid size-7 flex-none place-items-center rounded-full border text-[0.8125rem] font-bold tabular-nums",
                  isCurrent && "border-[var(--forest)] bg-[var(--forest)] text-[var(--paper)]",
                  done && "border-[var(--forest)] bg-[var(--mist)] text-[var(--forest)]",
                  !isCurrent && !done && "border-[var(--control-border)] text-[var(--ink-soft)]",
                )}
              >
                {done ? <Icon name="check" className="size-4" /> : index + 1}
              </span>
              <span aria-hidden="true" className="hidden text-left leading-tight md:inline">
                {step.title}
              </span>
              <span className="visually-hidden">{spoken}</span>
            </>
          );
          return (
            <li key={step.id} className="flex min-w-0 flex-col gap-2">
              <span
                aria-hidden="true"
                className={cx("h-0.5 rounded-full", isCurrent || done ? "bg-[var(--forest)]" : "bg-[var(--line)]")}
              />
              {open ? (
                <button
                  type="button"
                  onClick={() => onOpen(index)}
                  aria-current={isCurrent ? "step" : undefined}
                  className={cx(
                    "-mx-1 flex min-h-11 items-center gap-2.5 rounded-md px-1 text-[0.9375rem] font-semibold",
                    focusRing,
                    isCurrent ? "text-[var(--ink)]" : "cursor-pointer text-[var(--forest)] hover:underline",
                  )}
                >
                  {visual}
                </button>
              ) : (
                <span className="flex min-h-11 items-center gap-2.5 text-[0.9375rem] font-semibold text-[var(--ink-soft)]">
                  {visual}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Back / Continue row. Continue submits the step's form so Enter in a field also advances. */
export function StepActions({ onBack, children }: { onBack?: () => void; children?: ReactNode }) {
  return (
    <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-6">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className={cx(
            "inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-[0.9375rem] font-semibold text-[var(--forest)] hover:bg-[var(--mist)]",
            focusRing,
          )}
        >
          <Icon name="chevronLeft" className="size-4" />
          Back
        </button>
      ) : null}
      <div className="ml-auto flex flex-wrap items-center gap-3">
        {children ?? (
          <button
            type="submit"
            className={cx(
              "inline-flex min-h-11 items-center gap-1.5 rounded-md bg-[var(--forest)] px-5 text-[0.9375rem] font-semibold text-[var(--paper)] hover:bg-[var(--forest-deep)]",
              "focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-[var(--focus)]",
            )}
          >
            Continue
            <Icon name="chevronRight" className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Explains why a final action is unavailable. Pair with a disabled button via aria-describedby. */
export function NotConnected({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="flex max-w-[30rem] items-start gap-2 text-[0.9375rem] text-[var(--ink-soft)]">
      <Icon name="lock" className="mt-0.5 size-4 flex-none text-[var(--warning)]" />
      <span>{children}</span>
    </p>
  );
}

/** Answers summary for a flow's last step, with a "Change" button per row that reopens its step. */
export function ReviewList({
  rows,
  onChange,
}: {
  rows: readonly { label: string; value: string; step: number }[];
  onChange: (step: number) => void;
}) {
  return (
    <dl className="m-0 border-t border-[var(--ink)]">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-[var(--line)] py-3">
          <dt className="w-32 flex-none text-[0.9375rem] font-semibold text-[var(--ink-soft)]">{row.label}</dt>
          <dd className="m-0 min-w-0 flex-1 font-medium break-words">{row.value}</dd>
          <dd className="m-0">
            <button
              type="button"
              onClick={() => onChange(row.step)}
              className={cx(
                "min-h-11 rounded-md px-2 text-[0.9375rem] font-semibold text-[var(--forest)] underline underline-offset-4 hover:bg-[var(--mist)]",
                focusRing,
              )}
            >
              Change<span className="visually-hidden"> {row.label.toLowerCase()}</span>
            </button>
          </dd>
        </div>
      ))}
    </dl>
  );
}
"use client";

import { useId } from "react";
import { cx } from "@/components/ui/cx";

export type Choice<V extends string> = { value: V; label: string; description?: string; note?: string };

/**
 * Radio group as a list of full-width rows. Native radios keep arrow-key behaviour.
 * The group error is announced (role="alert") and linked to the fieldset.
 */
export function ChoiceList<V extends string>({
  legend,
  name,
  choices,
  value,
  onChange,
  error,
  columns = 1,
}: {
  legend: string;
  name: string;
  choices: readonly Choice<V>[];
  value: V | undefined;
  onChange: (value: V) => void;
  error?: string;
  columns?: 1 | 2;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <fieldset aria-describedby={error ? errorId : undefined} className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-3 p-0 text-[0.9375rem] font-semibold text-[var(--ink)]">{legend}</legend>
      <div className={cx("grid gap-2", columns === 2 && "sm:grid-cols-2")}>
        {choices.map((choice) => {
          const checked = value === choice.value;
          return (
            <label
              key={choice.value}
              className={cx(
                "flex cursor-pointer items-start gap-3 rounded-md border px-4 py-3.5 transition-colors duration-150 motion-reduce:transition-none",
                "has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]",
                checked
                  ? "border-[var(--forest)] bg-[var(--mist)]"
                  : error
                    ? "border-[var(--warning)] bg-white hover:border-[var(--forest)]"
                    : "border-[var(--control-border)] bg-white hover:border-[var(--forest)]",
              )}
            >
              <input
                type="radio"
                name={name}
                value={choice.value}
                checked={checked}
                onChange={() => onChange(choice.value)}
                className="mt-1 size-[1.125rem] flex-none accent-[var(--forest)] focus-visible:outline-none"
              />
              <span className="min-w-0">
                <span className="block font-semibold text-[var(--ink)]">{choice.label}</span>
                {choice.description ? (
                  <span className="mt-0.5 block text-[0.9375rem] text-[var(--ink-soft)]">{choice.description}</span>
                ) : null}
                {choice.note ? (
                  <span className="mt-1 block text-[0.875rem] font-medium text-[var(--warning)]">{choice.note}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-sm font-medium text-[var(--warning)]">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

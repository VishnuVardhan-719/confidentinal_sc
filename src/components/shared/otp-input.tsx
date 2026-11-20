"use client";

import { useMemo, type ComponentPropsWithRef } from "react";
import { cn } from "@/components/ui/cn";
import { sanitizeOtp } from "./input-format";
import { mergeRefs, useEarlyInputRef } from "./use-early-input";

/**
 * One real <input> (works with SMS autofill, paste and screen readers) drawn as segmented boxes.
 * Digits are never logged, put in URLs or persisted. Use inside <Field> for label/hint/error.
 * Digits typed before hydration are adopted, not cleared (REQUESTS R-FE-D-41).
 */
export function OTPInput({
  value,
  onValueChange,
  length = 6,
  className,
  ref,
  ...props
}: Omit<ComponentPropsWithRef<"input">, "value" | "onChange" | "type" | "maxLength"> & {
  value: string;
  onValueChange: (digits: string) => void;
  length?: number;
}) {
  const early = useEarlyInputRef(value, (raw) => onValueChange(sanitizeOtp(raw, length)));
  const inputRef = useMemo(() => mergeRefs(early, ref), [early, ref]);
  const chars = Array.from({ length }, (_, i) => value[i] ?? "");
  return (
    <div className={cn("relative w-fit", className)}>
      <div aria-hidden className="flex gap-2">
        {chars.map((c, i) => (
          <span
            key={i}
            className={cn(
              "inline-flex h-14 w-11 items-center justify-center rounded-md border bg-surface font-display text-2xl text-ink tabular sm:w-12",
              "border-border-strong",
            )}
          >
            {c}
          </span>
        ))}
      </div>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern={`\\d{${length}}`}
        spellCheck={false}
        {...props}
        ref={inputRef}
        value={value}
        onChange={(e) => onValueChange(sanitizeOtp(e.target.value, length))}
        className={cn(
          "absolute inset-0 h-full w-full cursor-text rounded-md bg-transparent text-transparent caret-transparent",
          "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus",
          "selection:bg-transparent",
        )}
      />
    </div>
  );
}

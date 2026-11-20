import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

/* The border uses --input-border (3.94:1 on white), which meets the 3:1 WCAG 1.4.11 minimum for control edges.
 * The invalid style keys off aria-invalid, so it also applies when FormField sets aria-invalid. */
export function Input({ invalid = false, className, ...rest }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        "min-h-11 w-full rounded-md border border-[var(--input-border)] bg-white px-3.5 text-base text-[var(--ink)] placeholder:text-[var(--placeholder)] " +
          "transition-colors duration-150 hover:border-[var(--forest)] " +
          "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] " +
          "disabled:cursor-not-allowed disabled:bg-[var(--mist)] disabled:opacity-70 motion-reduce:transition-none " +
          "aria-invalid:border-2 aria-invalid:border-[var(--warning)]",
        className,
      )}
      {...rest}
    />
  );
}

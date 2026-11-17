import type { InputHTMLAttributes } from "react";
import { cx } from "./cx";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export function Input({ invalid = false, className, ...rest }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cx(
        "min-h-11 w-full rounded-md border bg-white px-3.5 text-base text-[var(--ink)] placeholder:text-[#5d6f72] " +
          "transition-colors duration-150 hover:border-[var(--forest)] " +
          "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] " +
          "disabled:cursor-not-allowed disabled:bg-[var(--mist)] disabled:opacity-70 motion-reduce:transition-none",
        invalid ? "border-2 border-[var(--warning)]" : "border-[var(--line)]",
        className,
      )}
      {...rest}
    />
  );
}

import type { SelectHTMLAttributes } from "react";
import { cx } from "./cx";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
  /** Renders a first option with an empty value, so `required` rejects an untouched select. */
  placeholder?: string;
};

/**
 * Native <select> with the browser's default look removed and a drawn chevron, styled to match Input.
 * Keeps native keyboard, screen reader and mobile picker behaviour. Works inside FormField.
 */
export function Select({ invalid = false, placeholder, className, children, multiple, size, ...rest }: SelectProps) {
  // List boxes (multiple or size > 1) show their options inline, so a dropdown chevron would be wrong.
  const listBox = Boolean(multiple) || (size ?? 1) > 1;
  return (
    <div className="relative w-full">
      <select
        multiple={multiple}
        size={size}
        aria-invalid={invalid || undefined}
        className={cx(
          "w-full appearance-none rounded-md border bg-white px-3.5 text-base text-[var(--ink)] " +
            "transition-colors duration-150 hover:border-[var(--forest)] " +
            "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] " +
            "disabled:cursor-not-allowed disabled:bg-[var(--mist)] disabled:opacity-70 motion-reduce:transition-none",
          listBox ? "py-2" : "min-h-11 cursor-pointer pr-10",
          invalid ? "border-2 border-[var(--warning)]" : "border-[var(--line)]",
          className,
        )}
        {...rest}
      >
        {placeholder !== undefined && !listBox ? <option value="">{placeholder}</option> : null}
        {children}
      </select>
      {listBox ? null : (
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 16 16"
          className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-[var(--forest)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      )}
    </div>
  );
}

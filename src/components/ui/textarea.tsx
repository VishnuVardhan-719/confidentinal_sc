import type { TextareaHTMLAttributes } from "react";
import { cx } from "./cx";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

/** Multi-line text control styled to match Input. Works inside FormField (id, aria-describedby, invalid). */
export function Textarea({ invalid = false, className, rows = 4, ...rest }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cx(
        "min-h-28 w-full resize-y rounded-md border bg-white px-3.5 py-2.5 text-base leading-normal text-[var(--ink)] placeholder:text-[#5d6f72] " +
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

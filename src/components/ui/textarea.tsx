import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

/** Multi-line text control styled to match Input. Works inside FormField (id, aria-describedby, aria-invalid). */
export function Textarea({ invalid = false, className, rows = 4, ...rest }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        "min-h-28 w-full resize-y rounded-md border border-[var(--input-border)] bg-white px-3.5 py-2.5 text-base leading-normal text-[var(--ink)] placeholder:text-[var(--placeholder)] " +
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

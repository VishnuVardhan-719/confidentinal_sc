import type { ComponentPropsWithRef } from "react";
import { cn } from "./cn";

export const fieldControlClass = cn(
  "block w-full min-h-target rounded-md border border-border-strong bg-surface px-3.5 py-2 text-base text-ink",
  "transition-[border-color,box-shadow] duration-(--scv-duration-fast)",
  "hover:border-ink focus-visible:border-forest focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-focus",
  "aria-invalid:border-danger aria-invalid:hover:border-danger",
  "disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled disabled:text-disabled-text",
  "read-only:bg-paper",
);

export function Input({ className, type = "text", ...props }: ComponentPropsWithRef<"input">) {
  return <input type={type} className={cn(fieldControlClass, className)} {...props} />;
}

export function Textarea({ className, rows = 4, ...props }: ComponentPropsWithRef<"textarea">) {
  return <textarea rows={rows} className={cn(fieldControlClass, "min-h-28 resize-y py-3 leading-relaxed", className)} {...props} />;
}

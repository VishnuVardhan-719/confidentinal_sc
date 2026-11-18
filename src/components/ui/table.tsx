import type { ComponentPropsWithRef } from "react";
import { cn } from "./cn";

/**
 * Semantic table. The wrapper scrolls horizontally on narrow screens and is focusable so keyboard
 * users can scroll it; give it an accessible name via `label`.
 */
export function Table({ className, label, ...props }: ComponentPropsWithRef<"table"> & { label: string }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="w-full overflow-x-auto rounded-md border border-border bg-surface">
      <table className={cn("w-full border-collapse text-left text-base tabular", className)} {...props} />
    </div>
  );
}

export function TableCaption({ className, ...props }: ComponentPropsWithRef<"caption">) {
  return <caption className={cn("px-4 py-3 text-left text-sm text-muted caption-bottom", className)} {...props} />;
}

export function TableHeader({ className, ...props }: ComponentPropsWithRef<"thead">) {
  return <thead className={cn("bg-paper", className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentPropsWithRef<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentPropsWithRef<"tr">) {
  return <tr className={cn("border-b border-border hover:bg-paper/60", className)} {...props} />;
}

export function TableHead({ className, scope = "col", ...props }: ComponentPropsWithRef<"th">) {
  return <th scope={scope} className={cn("px-4 py-3 text-sm font-semibold whitespace-nowrap text-ink", className)} {...props} />;
}

export function TableCell({ className, ...props }: ComponentPropsWithRef<"td">) {
  return <td className={cn("px-4 py-3 align-top text-ink", className)} {...props} />;
}

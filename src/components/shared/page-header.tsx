import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  meta,
  className,
}: {
  title: string;
  description?: ReactNode;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  /** Small factual line under the description, e.g. a draft/version note. */
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("grid gap-4 border-b border-border pb-8", className)}>
      {breadcrumb}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="grid max-w-3xl gap-3">
          <h1 className="font-display text-3xl font-medium tracking-[-0.02em] text-ink">{title}</h1>
          {description ? <div className="measure text-lg text-muted">{description}</div> : null}
          {meta ? <div className="text-sm text-muted">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </header>
  );
}

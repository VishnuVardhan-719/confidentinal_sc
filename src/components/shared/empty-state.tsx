import { BookOpen, Inbox, MapPinOff, SearchX, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

const ICONS = { inbox: Inbox, search: SearchX, coverage: MapPinOff, stories: BookOpen } satisfies Record<string, LucideIcon>;

/** Honest "nothing here yet" state with a useful next action. Strings must be localized by the caller. */
export function EmptyState({
  title,
  description,
  action,
  icon = "inbox",
  headingLevel = "h2",
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: keyof typeof ICONS;
  headingLevel?: "h2" | "h3";
  className?: string;
}) {
  const Icon = ICONS[icon];
  const Heading = headingLevel;
  return (
    <div className={cn("flex flex-col items-start gap-4 rounded-lg border border-dashed border-border-strong/60 bg-surface/60 p-6 sm:p-8", className)}>
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-mist text-forest">
        <Icon aria-hidden className="size-6" />
      </span>
      <div className="grid gap-2">
        <Heading className="text-xl font-semibold text-ink">{title}</Heading>
        {description ? <div className="measure text-base text-muted">{description}</div> : null}
      </div>
      {action ? <div className="flex flex-wrap gap-3">{action}</div> : null}
    </div>
  );
}

import { CircleAlert, FlaskConical, Info, Lock, TriangleAlert, WifiOff, type LucideIcon } from "lucide-react";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/components/ui/cn";

const toneClass = {
  info: "border-info/30 bg-info-surface text-ink [&_[data-icon]]:text-info",
  warning: "border-warning/40 bg-warning-surface text-ink [&_[data-icon]]:text-warning-text",
  danger: "border-danger/30 bg-danger-surface text-ink [&_[data-icon]]:text-danger",
  neutral: "border-border bg-paper-deep text-ink [&_[data-icon]]:text-muted",
} as const;

const iconFor = { info: Info, warning: TriangleAlert, danger: CircleAlert, neutral: Info, lock: Lock, fixture: FlaskConical, offline: WifiOff } satisfies Record<string, LucideIcon>;

export type NoticeTone = keyof typeof toneClass;

/** Base callout used by InlineError, GateNotice, FixtureNotice and OfflineBanner. */
export function Notice({
  tone = "info",
  icon,
  title,
  children,
  action,
  className,
  ...props
}: Omit<ComponentPropsWithRef<"div">, "title"> & {
  tone?: NoticeTone;
  icon?: keyof typeof iconFor;
  title?: ReactNode;
  action?: ReactNode;
}) {
  const Icon = iconFor[icon ?? tone];
  return (
    <div className={cn("flex gap-3 rounded-md border p-4", toneClass[tone], className)} {...props}>
      <Icon data-icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="grid min-w-0 flex-1 gap-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-base text-ink/90">{children}</div> : null}
        {action ? <div className="mt-2 flex flex-wrap gap-3">{action}</div> : null}
      </div>
    </div>
  );
}

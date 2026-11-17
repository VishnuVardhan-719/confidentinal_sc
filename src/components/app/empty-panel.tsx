import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Icon, type IconName } from "./icons";

/**
 * Empty or locked state for an app section. Says what will appear here and what to do next,
 * instead of a bare "nothing here". `tone="locked"` is for features that are switched off.
 */
export function EmptyPanel({
  icon,
  title,
  children,
  actions,
  tone = "empty",
  headingLevel = 3,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  tone?: "empty" | "locked";
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div
      className={cx(
        "flex flex-col gap-4 rounded-md border p-6 sm:flex-row sm:items-start sm:gap-5",
        tone === "locked" ? "border-[var(--line)] bg-[var(--paper-raised)]" : "border-dashed border-[var(--line-strong)]",
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "grid size-11 flex-none place-items-center rounded-full",
          tone === "locked" ? "bg-[#f4ece0] text-[var(--warning)]" : "bg-[var(--mist)] text-[var(--forest)]",
        )}
      >
        <Icon name={icon} className="size-5" />
      </span>
      <div className="min-w-0 max-w-[36rem]">
        <Heading className="font-sans text-[1.0625rem] leading-snug font-bold tracking-normal">{title}</Heading>
        <div className="mt-1.5 space-y-2 text-[0.9375rem] text-[var(--ink-soft)]">{children}</div>
        {actions ? <div className="mt-5 flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}

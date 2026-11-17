import { DEMO_LABEL } from "@/lib/demo/data";
import { cx } from "@/components/ui/cx";

/** Required on every screen and card that shows synthetic demo rows. */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex min-h-6 shrink-0 items-center gap-1.5 rounded-full border border-[var(--warning)]/45 bg-[#fbf4ea] px-2.5 text-[0.8125rem] leading-tight font-semibold text-[var(--warning)]",
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {DEMO_LABEL}
    </span>
  );
}

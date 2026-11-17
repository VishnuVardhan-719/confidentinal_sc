import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export type SkeletonProps = Omit<HTMLAttributes<HTMLDivElement>, "children">;

/**
 * Decorative loading placeholder. Hidden from assistive technology, so pair it with Loading
 * (role="status") or another announced label. Set size with className, e.g. "h-6 w-48".
 * The pulse stops under prefers-reduced-motion.
 */
export function Skeleton({ className, ...rest }: SkeletonProps) {
  return (
    <div
      {...rest}
      aria-hidden="true"
      className={cx("h-4 w-full rounded-md bg-[var(--line)]/60 animate-pulse motion-reduce:animate-none", className)}
    />
  );
}

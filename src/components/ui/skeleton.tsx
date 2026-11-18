import type { ComponentPropsWithRef } from "react";
import { cn } from "./cn";

/** Decorative placeholder block. Pair with a visually hidden loading label (see LoadingSkeleton). */
export function Skeleton({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div
      aria-hidden
      className={cn("rounded-md bg-paper-deep motion-safe:animate-[scv-pulse_1.6s_ease-in-out_infinite]", className)}
      {...props}
    />
  );
}

import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithRef } from "react";
import { cn } from "./cn";

export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-medium whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "border-border bg-paper-deep text-ink",
        info: "border-info/25 bg-info-surface text-info",
        progress: "border-forest/25 bg-mist text-forest",
        success: "border-success/25 bg-success-surface text-success",
        warning: "border-warning/35 bg-warning-surface text-warning-text",
        danger: "border-danger/25 bg-danger-surface text-danger",
        brand: "border-forest/40 bg-surface text-forest",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export function Badge({ className, tone, ...props }: ComponentPropsWithRef<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

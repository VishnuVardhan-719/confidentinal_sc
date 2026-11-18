import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithRef } from "react";
import { cn } from "./cn";

export const buttonVariants = cva(
  [
    "inline-flex min-h-target items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap",
    "transition-[background-color,color,box-shadow,transform] duration-(--scv-duration-fast) ease-out",
    "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus",
    "active:translate-y-px disabled:pointer-events-none aria-disabled:pointer-events-none",
    "disabled:bg-disabled disabled:text-disabled-text disabled:shadow-none",
    "aria-disabled:bg-disabled aria-disabled:text-disabled-text",
    "[&_svg]:size-[1.15em] [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: "bg-forest text-on-forest shadow-raised hover:bg-forest-strong",
        secondary: "border border-forest bg-surface text-forest hover:bg-mist",
        quiet: "text-forest underline-offset-4 hover:bg-mist hover:underline",
        danger: "bg-danger text-white hover:bg-danger-strong",
        onForest: "bg-paper text-forest hover:bg-white focus-visible:outline-paper",
      },
      size: {
        md: "px-5 text-base",
        lg: "min-h-12 px-6 text-lg",
        icon: "w-target px-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ComponentPropsWithRef<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render the single child (e.g. a Link) with button styles. */
    asChild?: boolean;
  };

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? "button" })}
      {...props}
    />
  );
}

import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Shared with ButtonLink so a navigation link can look like a button without being a <button>. */
export const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 text-[0.9375rem] font-semibold no-underline " +
    "transition-colors duration-150 focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-[var(--focus)] " +
    "active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none motion-reduce:active:translate-y-0",
  {
    variants: {
      variant: {
        primary: "bg-[var(--forest)] text-[var(--paper)] hover:bg-[var(--forest-deep)] hover:no-underline",
        secondary:
          "border border-[var(--forest)] bg-transparent text-[var(--forest)] hover:bg-[var(--mist)] hover:no-underline",
        quiet: "bg-transparent text-[var(--forest)] underline underline-offset-4 hover:bg-[var(--mist)]",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
};

export function Button({
  variant = "primary",
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
        />
      ) : null}
      {children}
    </button>
  );
}

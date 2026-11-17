import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

type Variant = "primary" | "secondary" | "quiet";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
};

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 text-[0.9375rem] font-semibold " +
  "transition-colors duration-150 focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-[var(--focus)] " +
  "active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none motion-reduce:active:translate-y-0";

const variants: Record<Variant, string> = {
  primary: "bg-[var(--forest)] text-[var(--paper)] hover:bg-[#0b4c47]",
  secondary: "border border-[var(--forest)] bg-transparent text-[var(--forest)] hover:bg-[var(--mist)]",
  quiet: "bg-transparent text-[var(--forest)] underline underline-offset-4 hover:bg-[var(--mist)]",
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
      className={cx(base, variants[variant], className)}
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

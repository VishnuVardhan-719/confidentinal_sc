import Link from "next/link";
import type { ComponentProps } from "react";
import { cx } from "./ui/cx";

type Variant = "primary" | "secondary" | "quiet";

/*
 * Navigation that looks like a Button. A CTA that changes the page must be a link, not a <button>,
 * so this mirrors the visual variants of ui/button.tsx (which is not exported as classes).
 * Keep the two in sync until U01-b exposes a shared class helper.
 */
const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 text-[0.9375rem] font-semibold no-underline " +
  "transition-colors duration-150 focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-[var(--focus)] " +
  "active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0";

const variants: Record<Variant, string> = {
  primary: "bg-[var(--forest)] text-[var(--paper)] hover:bg-[var(--forest-deep)] hover:no-underline",
  secondary:
    "border border-[var(--forest)] bg-transparent text-[var(--forest)] hover:bg-[var(--mist)] hover:no-underline",
  quiet: "bg-transparent text-[var(--forest)] underline underline-offset-4 hover:bg-[var(--mist)]",
};

export type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant };

export function ButtonLink({ variant = "primary", className, ...rest }: ButtonLinkProps) {
  return <Link className={cx(base, variants[variant], className)} {...rest} />;
}

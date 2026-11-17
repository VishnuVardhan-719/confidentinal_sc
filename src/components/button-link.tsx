import Link from "next/link";
import type { ComponentProps } from "react";
import { buttonClasses, type ButtonVariant } from "./ui/button";

export type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: ButtonVariant };

/** Navigation styled as a Button. A CTA that changes the page must be a link, not a <button>. */
export function ButtonLink({ variant = "primary", className, ...rest }: ButtonLinkProps) {
  // Anchors are underlined by default in globals.css; only the quiet variant keeps it.
  const underline = variant === "quiet" ? undefined : "no-underline";
  return <Link className={buttonClasses(variant, [underline, className].filter(Boolean).join(" "))} {...rest} />;
}

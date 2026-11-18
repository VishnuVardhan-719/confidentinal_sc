import Link from "next/link";
import type { ComponentProps } from "react";
import { buttonVariants, type ButtonVariant } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* Navigation that looks like a Button. A CTA that changes the page must be a link, not a <button>. */
export type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: ButtonVariant };

export function ButtonLink({ variant = "primary", className, ...rest }: ButtonLinkProps) {
  return <Link className={cn(buttonVariants({ variant }), className)} {...rest} />;
}

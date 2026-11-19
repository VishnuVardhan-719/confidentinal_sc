import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** The next step offered with an empty, error or gated state, so no state is a dead end. Server or client. */
export function LinkAction({ href, children, variant = "secondary" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "quiet" }) {
  return <Button asChild variant={variant}><Link href={href}>{children}</Link></Button>;
}

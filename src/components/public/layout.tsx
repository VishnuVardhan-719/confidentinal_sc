import type { ComponentPropsWithRef, ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Link } from "@/i18n/navigation";

/** Page-width container used by every public page. */
export function Container({ className, ...props }: ComponentPropsWithRef<"div">) {
  return <div className={cn("mx-auto w-full max-w-content px-4 sm:px-6 lg:px-8", className)} {...props} />;
}

/** Standard top of an interior public page. */
export function PublicPageIntro({ title, lead, children }: { title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <Container className="grid gap-5 pt-12 pb-10 md:pt-20 md:pb-14">
      <h1 className="max-w-4xl font-display text-[clamp(2.25rem,1.6rem+2.6vw,3.5rem)] leading-[1.08] font-medium tracking-[-0.025em] text-ink">
        {title}
      </h1>
      {lead ? <p className="measure text-xl leading-relaxed text-muted">{lead}</p> : null}
      {children}
    </Container>
  );
}

/** Text link with a trailing arrow, for "Explore" style actions. */
export function ArrowLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex min-h-target items-center gap-2 font-semibold text-forest underline decoration-forest/30 decoration-2 underline-offset-[6px] hover:decoration-forest",
        className,
      )}
    >
      {children}
      <ArrowRight aria-hidden className="size-4.5 transition-transform duration-(--scv-duration-fast) group-hover:translate-x-0.5" />
    </Link>
  );
}

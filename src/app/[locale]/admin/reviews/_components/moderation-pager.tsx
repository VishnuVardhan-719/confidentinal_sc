import { ChevronRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * Cursor pager for the moderation queue and the decision log (same pattern as the patient bookings
 * list): back to the first page, and the next page while the server returns a cursor. Cursor pages
 * cannot go back one step, so there is no "previous". Renders nothing on a single page.
 */
export function ModerationPager({
  label,
  firstHref,
  nextHref,
  text,
}: {
  label: string;
  /** Set when the current page is not the first. */
  firstHref: string | null;
  nextHref: string | null;
  text: { first: string; next: string; end: string };
}) {
  if (!firstHref && !nextHref) return null;
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      {firstHref ? (
        <Button asChild variant="quiet">
          <Link href={firstHref}>
            <RotateCcw aria-hidden />
            {text.first}
          </Link>
        </Button>
      ) : (
        <span />
      )}
      {nextHref ? (
        <Button asChild variant="secondary">
          <Link href={nextHref}>
            {text.next}
            <ChevronRight aria-hidden />
          </Link>
        </Button>
      ) : (
        <p className="text-sm text-muted">{text.end}</p>
      )}
    </nav>
  );
}

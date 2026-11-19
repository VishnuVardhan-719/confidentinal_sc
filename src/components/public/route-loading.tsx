import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { Container } from "./layout";

/**
 * Public route loading placeholder: matches the public page container and intro spacing, announces a
 * localized "Loading" to screen readers, and shows no fake names, counts or prices.
 */
export function PublicRouteLoading({ variant = "page", rows = 3 }: { variant?: "page" | "list" | "detail"; rows?: number }) {
  return (
    <Container className="pt-12 pb-20 md:pt-20">
      <LoadingSkeleton variant={variant} rows={rows} />
    </Container>
  );
}

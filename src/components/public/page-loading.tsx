import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { Container } from "./layout";

/**
 * Loading state for public routes that render at request time (e.g. stories/[slug]). Static public
 * pages are prerendered and never show it. Wire as `export { PublicPageLoading as default }` in a
 * route's loading.tsx (REQUESTS R-FE01-13).
 */
export function PublicPageLoading() {
  return (
    <Container className="py-12 md:py-20">
      <LoadingSkeleton variant="page" rows={4} />
    </Container>
  );
}

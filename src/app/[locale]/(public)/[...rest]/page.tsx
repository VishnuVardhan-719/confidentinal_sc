import { notFound } from "next/navigation";

/**
 * Catch-all so unknown /{locale}/... paths render the localized not-found page. More specific routes
 * (including other workstreams' role routes) always take precedence over this segment.
 */
export function generateStaticParams() {
  // Cache Components needs one sample param; every value 404s.
  return [{ rest: ["__not-found__"] }];
}

export default function CatchAllNotFound() {
  notFound();
}

import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

/** Fallback for private page content that waits on the session check. */
export function PageLoading({ variant = "page" }: { variant?: "page" | "list" | "detail" }) {
  return <LoadingSkeleton variant={variant} rows={3} />;
}

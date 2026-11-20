import { Skeleton } from "@/components/ui/skeleton";

/** Loading state for app screens: page-shaped placeholders plus one announced status. */
export default function AppLoading() {
  return (
    <div className="max-w-[46rem]">
      <p role="status" aria-live="polite" className="visually-hidden">
        Loading page
      </p>
      <Skeleton className="h-10 w-2/3 max-w-[22rem]" />
      <Skeleton className="mt-4 h-4 w-full max-w-[34rem]" />
      <Skeleton className="mt-12 h-28 w-full" />
      <Skeleton className="mt-6 h-28 w-full" />
    </div>
  );
}

"use client";

import { ErrorState } from "@/components/ui/states";

/** Error state for app screens. The shell and nav stay in place; only the page content is replaced. */
export default function AppError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="max-w-[46rem]">
      <ErrorState
        title="This screen could not be shown"
        message="Please try again. If it keeps happening, come back a little later."
        onRetry={retry}
      />
    </div>
  );
}

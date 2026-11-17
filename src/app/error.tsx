"use client";

import { ErrorState } from "@/components/ui/states";

export default function RouteError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="frame page">
      <header className="page-header">
        <h1>Something went wrong</h1>
      </header>
      <div className="max-w-[46rem]">
        <ErrorState
          title="This page could not be shown"
          message="Please try again. If it keeps happening, come back a little later."
          onRetry={retry}
        />
      </div>
    </div>
  );
}

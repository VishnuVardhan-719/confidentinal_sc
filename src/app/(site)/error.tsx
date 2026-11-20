"use client";

import Link from "next/link";
import { ErrorState } from "@/components/ui/states";

export default function SiteError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="frame page">
      <header className="page-header">
        <h1>This page could not be shown</h1>
      </header>
      <div className="max-w-[46rem]">
        <ErrorState
          title="Something went wrong while loading"
          message="Try again. If it keeps happening, come back a little later."
          onRetry={retry}
        />
        <p className="mt-6">
          In an emergency in India, call <a href="tel:112">112</a>. You can also go to the <Link href="/">home page</Link>.
        </p>
      </div>
    </div>
  );
}

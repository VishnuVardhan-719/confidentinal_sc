"use client";

import "./globals.css";
import { ErrorState } from "@/components/ui/states";

// Replaces the root layout when it fails, so it renders its own document and keeps the emergency line visible.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <title>Something went wrong | SureCure Visit</title>
        <main className="frame page">
          <h1>Something went wrong</h1>
          <div className="mt-8 max-w-[46rem]">
            <ErrorState
              title="This page could not be shown"
              message="Please try again. If it keeps happening, come back a little later."
              onRetry={retry}
            />
          </div>
          <p className="mt-8">
            For emergencies in India, call <a href="tel:112">112</a>. SureCure Visit is not an emergency service.
          </p>
        </main>
      </body>
    </html>
  );
}

"use client";

import Link from "next/link";
import { ErrorState } from "@/components/ui/states";

export default function AuthError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <ErrorState
        title="This form could not be shown"
        message="Nothing you typed was sent. Please try again, or go back to the home page."
        onRetry={retry}
      />
      <Link href="/" className="text-link self-start">
        Back to home
      </Link>
    </div>
  );
}

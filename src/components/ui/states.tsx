import type { ReactNode } from "react";
import { Button } from "./button";

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 py-8 text-[var(--ink)]">
      <span
        aria-hidden="true"
        className="size-5 animate-spin rounded-full border-2 border-[var(--forest)] border-t-transparent motion-reduce:animate-none"
      />
      <span>{label}…</span>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="grid grid-cols-[1.5rem_1fr] gap-x-4 rounded-md border border-[var(--warning)]/45 bg-[#fbf4ea] p-5 sm:p-6"
    >
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 24 24"
        className="mt-0.5 size-6 text-[var(--warning)]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="9.25" />
        <path d="M12 7.5v5.25" />
        <circle cx="12" cy="16.25" r=".6" fill="currentColor" stroke="none" />
      </svg>
      <div className="min-w-0">
        <h2 className="text-xl text-[var(--ink)]">{title}</h2>
        {message ? <p className="mt-2 max-w-prose text-[var(--ink-soft)]">{message}</p> : null}
        {onRetry ? (
          <Button variant="secondary" className="mt-4" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--line)] p-8 text-center">
      <h2 className="text-xl">{title}</h2>
      {message ? <p className="mx-auto mt-2 max-w-prose">{message}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

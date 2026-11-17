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
    <div role="alert" className="rounded-md border-l-4 border-[var(--warning)] bg-[var(--mist)] p-5">
      <h2 className="text-xl">{title}</h2>
      {message ? <p className="mt-2 max-w-prose">{message}</p> : null}
      {onRetry ? (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
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

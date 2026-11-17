"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { startDemoSession, type DemoActionState } from "@/lib/demo/auth-actions";
import { DEMO_ROLE_LABEL } from "@/lib/demo/auth-core";
import { DEMO_LABEL, DEMO_USERS, type DemoRole } from "@/lib/demo/data";
import { cx } from "@/components/ui/cx";

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-sm border border-[var(--warning)] bg-[var(--paper-raised)] px-2 py-0.5 text-[0.8125rem] font-bold leading-snug text-[var(--warning)]",
        className,
      )}
    >
      {DEMO_LABEL}
    </span>
  );
}

function RoleButton({ role, name }: { role: DemoRole; name: string }) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get("role") === role;
  return (
    <button
      type="submit"
      name="role"
      value={role}
      disabled={pending}
      aria-busy={mine || undefined}
      className={
        "group grid w-full grid-cols-[1fr_auto] items-center gap-x-4 border-b border-[var(--line)] px-2 py-3 text-left " +
        "hover:bg-[var(--mist)] disabled:cursor-wait disabled:opacity-60 " +
        "focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-[var(--focus)]"
      }
    >
      <span className="flex flex-col">
        <span className="font-semibold text-[var(--forest)] group-hover:underline group-hover:underline-offset-4">
          Try demo as {DEMO_ROLE_LABEL[role]}
        </span>
        <span className="text-[0.875rem] text-[var(--ink-soft)]">{name}</span>
      </span>
      {mine ? (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-[var(--forest)] border-t-transparent motion-reduce:animate-none"
        />
      ) : (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-5 text-[var(--forest)]">
          <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function PendingNote() {
  const { pending } = useFormStatus();
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {pending ? "Opening the demo…" : ""}
    </p>
  );
}

const initial: DemoActionState = { error: null };

/** Only rendered when NEXT_PUBLIC_DEMO_MODE=true (checked by the page and again inside the server action). */
export function DemoPanel() {
  const [state, action] = useActionState(startDemoSession, initial);
  return (
    <section aria-labelledby="demo-title" className="mt-14 border-t-2 border-[var(--ink)] pt-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="demo-title" className="text-[clamp(1.5rem,2.4vw,1.875rem)]">
          Explore the demo
        </h2>
        <DemoBadge />
      </div>
      <p className="mt-3 max-w-[34rem] text-[0.9375rem] text-[var(--ink-soft)]">
        Pick a role to click through the app with made-up people, providers and prices. No account is created, no
        payment is taken, and nothing you do reaches a real provider.
      </p>
      <form action={action} className="mt-5 border-t border-[var(--line)]">
        {DEMO_USERS.map((u) => (
          <RoleButton key={u.role} role={u.role} name={u.name} />
        ))}
        <PendingNote />
      </form>
      {state.error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-[var(--warning)]">
          {state.error}
        </p>
      ) : null}
      <p className="mt-3 text-[0.875rem] text-[var(--ink-soft)]">
        The admin demo is for showing the review screens only. Real admin accounts are invite-only.
      </p>
    </section>
  );
}

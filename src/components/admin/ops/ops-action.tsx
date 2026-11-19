"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useTrackedRun } from "@/components/admin/ops/use-tracked-run";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { InlineError } from "@/components/shared/inline-error";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/modules/admin/action-result";

export type OpsActionInput = { idempotencyKey: string; reason?: string };

export type OpsActionLabels = {
  label: string;
  done: string;
  /** Raw message with a `{reference}` token, used when the server returns the reference of a created record. */
  doneWithReference?: string;
  confirm?: { title: string; description: string; confirmLabel: string };
  reason?: { label: string; placeholder: string; required: string; options: { value: string; label: string }[] };
};

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * One user intent bound to a server action. The idempotency key is created once
 * per intent and reused on retry; the page is refetched only after the server
 * confirms. No optimistic state change.
 */
export function OpsAction({
  labels,
  run,
  tone = "primary",
  variant = "primary",
}: {
  labels: OpsActionLabels;
  run: (input: OpsActionInput) => Promise<ActionResult>;
  tone?: "primary" | "danger";
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const toast = useToast();
  const key = useRef<string>(newKey());
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [missingReason, setMissingReason] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { running, track } = useTrackedRun();
  const [refreshing, startTransition] = useTransition();
  const pending = running || refreshing;

  /** Returns null when a request for this intent is already in flight (duplicate submit dropped). */
  async function execute(): Promise<ActionResult | null> {
    if (labels.reason && reason === "") {
      setMissingReason(true);
      return { ok: false, code: "validation" };
    }
    setMissingReason(false);
    // A rejected action becomes "unavailable" and keeps the key, so a retry stays idempotent.
    const result = await track(async () => {
      const r = await run({ idempotencyKey: key.current, ...(labels.reason ? { reason } : {}) });
      if (r.ok) {
        key.current = newKey();
        const title = r.reference && labels.doneWithReference ? labels.doneWithReference.replace("{reference}", r.reference) : labels.done;
        toast({ title, tone: "success" });
        startTransition(() => router.refresh());
      }
      return r;
    });
    return result;
  }

  if (!labels.confirm) {
    return (
      <div className="grid gap-2">
        <Button
          variant={tone === "danger" ? "danger" : variant}
          disabled={pending}
          aria-busy={pending}
          onClick={async () => {
            if (pending) return;
            setError(null);
            const result = await execute();
            if (result && !result.ok) setError(result.code);
          }}
        >
          {labels.label}
        </Button>
        {error ? <InlineError code={error} /> : null}
      </div>
    );
  }

  return (
    <ConfirmDialog
      trigger={<Button variant={tone === "danger" ? "danger" : variant}>{labels.label}</Button>}
      title={labels.confirm.title}
      confirmLabel={labels.confirm.confirmLabel}
      tone={tone}
      onConfirm={async () => (await execute()) ?? { ok: false, code: "conflict" }}
      description={
        <div className="grid gap-4">
          <p>{labels.confirm.description}</p>
          {labels.reason ? (
            <div className="grid gap-2">
              <label htmlFor={reasonId} className="text-base font-semibold text-ink">
                {labels.reason.label}
              </label>
              {missingReason ? (
                <p id={`${reasonId}-error`} className="text-sm font-medium text-danger">
                  {labels.reason.required}
                </p>
              ) : null}
              <select
                id={reasonId}
                value={reason}
                aria-invalid={missingReason || undefined}
                aria-describedby={missingReason ? `${reasonId}-error` : undefined}
                onChange={(e) => setReason(e.target.value)}
                className="min-h-target rounded-md border border-border-strong bg-surface px-3 text-base text-ink"
              >
                <option value="">{labels.reason.placeholder}</option>
                {labels.reason.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      }
    />
  );
}

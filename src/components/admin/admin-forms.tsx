"use client";

import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { ErrorSummary } from "@/components/shared/error-summary";
import { Field } from "@/components/shared/field";
import { InlineError } from "@/components/shared/inline-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/modules/admin/action-result";

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const selectClass = "min-h-target w-full rounded-md border border-border-strong bg-surface px-3 text-base text-ink";

/** Reference search. The reference goes to the server in the action body, never into the URL. */
export function BookingSearchForm({ run, labels }: { run: (reference: string) => Promise<ActionResult>; labels: { label: string; hint: string; search: string; invalid: string } }) {
  const id = useId();
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, startTransition] = useTransition();
  const inputId = `${id}-ref`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setAttempt((n) => n + 1);
    const result = await run(value);
    if (!result.ok) {
      setError(result.code === "validation" ? labels.invalid : result.code);
      return;
    }
    setError(null);
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={submit} noValidate className="grid max-w-xl gap-4" role="search">
      {error === labels.invalid ? <ErrorSummary errors={[{ fieldId: inputId, message: labels.invalid }]} focusKey={attempt} /> : null}
      {error && error !== labels.invalid ? <InlineError code={error} /> : null}
      <Field id={inputId} label={labels.label} hint={labels.hint} error={error === labels.invalid ? labels.invalid : undefined} required>
        {(p) => <Input {...p} autoComplete="off" spellCheck={false} value={value} onChange={(e) => setValue(e.target.value)} />}
      </Field>
      <div>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {labels.search}
        </Button>
      </div>
    </form>
  );
}

export function InviteAdminForm({
  run,
  options,
  labels,
}: {
  run: (form: { email: string; capability: string; idempotencyKey: string }) => Promise<ActionResult>;
  options: { value: string; label: string }[];
  labels: { title: string; email: string; emailInvalid: string; capability: string; capabilityRequired: string; placeholder: string; submit: string; done: string };
}) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const key = useRef(newKey());
  const [email, setEmail] = useState("");
  const [capability, setCapability] = useState("");
  const [errors, setErrors] = useState<{ email?: boolean; capability?: boolean }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, startTransition] = useTransition();
  const emailId = `${id}-email`;
  const capId = `${id}-cap`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const next = { email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), capability: capability === "" };
    setErrors(next);
    setAttempt((n) => n + 1);
    if (next.email || next.capability) return;
    const result = await run({ email, capability, idempotencyKey: key.current });
    if (!result.ok) {
      setErrors({ email: Boolean(result.fields?.email), capability: Boolean(result.fields?.capability) });
      setServerError(result.code);
      return;
    }
    key.current = newKey();
    setEmail("");
    setCapability("");
    toast({ title: labels.done, tone: "success" });
    startTransition(() => router.refresh());
  }

  const summary = [
    ...(errors.email ? [{ fieldId: emailId, message: labels.emailInvalid }] : []),
    ...(errors.capability ? [{ fieldId: capId, message: labels.capabilityRequired }] : []),
  ];
  return (
    <form onSubmit={submit} noValidate className="grid max-w-xl gap-4" aria-label={labels.title}>
      {summary.length ? <ErrorSummary errors={summary} focusKey={attempt} /> : null}
      {serverError && serverError !== "validation" ? <InlineError code={serverError} /> : null}
      <Field id={emailId} label={labels.email} error={errors.email ? labels.emailInvalid : undefined} required>
        {(p) => <Input {...p} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />}
      </Field>
      <Field id={capId} label={labels.capability} error={errors.capability ? labels.capabilityRequired : undefined} required>
        {(p) => (
          <select {...p} className={selectClass} value={capability} onChange={(e) => setCapability(e.target.value)}>
            <option value="">{labels.placeholder}</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {labels.submit}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { ErrorSummary, type SummaryError } from "@/components/shared/error-summary";
import { Field } from "@/components/shared/field";
import { InlineError } from "@/components/shared/inline-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/modules/admin/action-result";

type Labels = {
  edit: string;
  title: string;
  price: string;
  priceHint: string;
  preparation: string;
  preparationHint: string;
  active: string;
  save: string;
  saved: string;
  priceInvalid: string;
  preparationInvalid: string;
};

type FormState = { price: string; preparation: string; active: boolean };

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** Validates locally for fast feedback; the server validates again and is authoritative. */
export function validateCatalogForm(form: FormState): { price?: "invalid"; preparation?: "invalid" } {
  const errors: { price?: "invalid"; preparation?: "invalid" } = {};
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(form.price.trim())) errors.price = "invalid";
  const prep = form.preparation.trim();
  if (prep === "" || prep.length > 500 || /<\s*[a-zA-Z!/?]/.test(prep)) errors.preparation = "invalid";
  return errors;
}

/** Catalog item editor (price, preparation, offered). Saves through a server action, then refetches. */
export function CatalogEditForm({ initial, run, labels }: { initial: FormState; run: (form: FormState & { idempotencyKey: string }) => Promise<ActionResult>; labels: Labels }) {
  const router = useRouter();
  const toast = useToast();
  const id = useId();
  const key = useRef(newKey());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<{ price?: string; preparation?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, startTransition] = useTransition();

  const priceId = `${id}-price`;
  const prepId = `${id}-prep`;
  const activeId = `${id}-active`;
  const summary: SummaryError[] = [
    ...(errors.price ? [{ fieldId: priceId, message: labels.priceInvalid }] : []),
    ...(errors.preparation ? [{ fieldId: prepId, message: labels.preparationInvalid }] : []),
  ];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const local = validateCatalogForm(form);
    setErrors(local);
    setAttempt((n) => n + 1);
    if (local.price || local.preparation) return;
    const result = await run({ ...form, idempotencyKey: key.current });
    if (!result.ok) {
      if (result.fields) setErrors({ price: result.fields.price, preparation: result.fields.preparation });
      setServerError(result.code);
      return;
    }
    key.current = newKey();
    setOpen(false);
    toast({ title: labels.saved, tone: "success" });
    startTransition(() => router.refresh());
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="secondary">{labels.edit}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{labels.title}</DialogTitle>
        <DialogDescription className="sr-only">{labels.preparationHint}</DialogDescription>
        <form onSubmit={submit} noValidate className="grid gap-5">
          {summary.length > 0 ? <ErrorSummary errors={summary} focusKey={attempt} /> : null}
          {serverError && serverError !== "validation" ? <InlineError code={serverError} /> : null}
          <Field id={priceId} label={labels.price} hint={labels.priceHint} error={errors.price ? labels.priceInvalid : undefined} required>
            {(p) => <Input {...p} inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />}
          </Field>
          <Field id={prepId} label={labels.preparation} hint={labels.preparationHint} error={errors.preparation ? labels.preparationInvalid : undefined} required>
            {(p) => <Textarea {...p} maxLength={500} value={form.preparation} onChange={(e) => setForm({ ...form, preparation: e.target.value })} />}
          </Field>
          <label htmlFor={activeId} className="flex min-h-target items-center gap-3 text-base text-ink">
            <input id={activeId} type="checkbox" className="size-5 accent-forest" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            {labels.active}
          </label>
          <DialogFooter>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {labels.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

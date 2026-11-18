"use client";

import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { ErrorSummary, type SummaryError } from "@/components/shared/error-summary";
import { Field } from "@/components/shared/field";
import { InlineError } from "@/components/shared/inline-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/modules/admin/action-result";

type Option = { resourceId: string; label: string };
type Labels = {
  accept: string;
  title: string;
  body: string;
  vehicle: string;
  driver: string;
  placeholder: string;
  vehicleRequired: string;
  driverRequired: string;
  confirm: string;
  done: string;
};

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const selectClass = "min-h-target w-full rounded-md border border-border-strong bg-surface px-3 text-base text-ink";

/** Manual acceptance: the operator picks one assignable vehicle and one assignable driver. */
export function AcceptRequestForm({
  vehicles,
  drivers,
  run,
  labels,
}: {
  vehicles: Option[];
  drivers: Option[];
  run: (form: { vehicleResourceId: string; driverResourceId: string; idempotencyKey: string }) => Promise<ActionResult>;
  labels: Labels;
}) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const key = useRef(newKey());
  const [open, setOpen] = useState(false);
  const [vehicle, setVehicle] = useState("");
  const [driver, setDriver] = useState("");
  const [errors, setErrors] = useState<{ vehicle?: boolean; driver?: boolean }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, startTransition] = useTransition();
  const vId = `${id}-vehicle`;
  const dId = `${id}-driver`;
  const summary: SummaryError[] = [
    ...(errors.vehicle ? [{ fieldId: vId, message: labels.vehicleRequired }] : []),
    ...(errors.driver ? [{ fieldId: dId, message: labels.driverRequired }] : []),
  ];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const next = { vehicle: vehicle === "", driver: driver === "" };
    setErrors(next);
    setAttempt((n) => n + 1);
    if (next.vehicle || next.driver) return;
    const result = await run({ vehicleResourceId: vehicle, driverResourceId: driver, idempotencyKey: key.current });
    if (!result.ok) {
      setErrors({ vehicle: Boolean(result.fields?.vehicleResourceId), driver: Boolean(result.fields?.driverResourceId) });
      setServerError(result.code);
      return;
    }
    key.current = newKey();
    setOpen(false);
    toast({ title: labels.done, tone: "success" });
    startTransition(() => router.refresh());
  }

  return (
    <Dialog open={open} onOpenChange={(n) => !pending && setOpen(n)}>
      <DialogTrigger asChild>
        <Button>{labels.accept}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{labels.title}</DialogTitle>
        <DialogDescription>{labels.body}</DialogDescription>
        <form onSubmit={submit} noValidate className="grid gap-5">
          {summary.length ? <ErrorSummary errors={summary} focusKey={attempt} /> : null}
          {serverError && serverError !== "validation" ? <InlineError code={serverError} /> : null}
          <Field id={vId} label={labels.vehicle} error={errors.vehicle ? labels.vehicleRequired : undefined} required>
            {(p) => (
              <select {...p} className={selectClass} value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
                <option value="">{labels.placeholder}</option>
                {vehicles.map((v) => (
                  <option key={v.resourceId} value={v.resourceId}>
                    {v.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id={dId} label={labels.driver} error={errors.driver ? labels.driverRequired : undefined} required>
            {(p) => (
              <select {...p} className={selectClass} value={driver} onChange={(e) => setDriver(e.target.value)}>
                <option value="">{labels.placeholder}</option>
                {drivers.map((d) => (
                  <option key={d.resourceId} value={d.resourceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {labels.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { formatSlotFull, SlotPicker } from "@/components/booking/slot-picker";
import { ErrorSummary, type SummaryError } from "@/components/shared/error-summary";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import { formatPaise, type Locale } from "@/lib/format";
import type { PatientAddress, PatientMember } from "@/modules/patient/schemas";
import type { RequestLine, RequestSlot } from "@/modules/service-requests/core";
import { LinkAction } from "./link-action";

export type RequestFormActions = {
  slots: (providerId: unknown, hours?: unknown) => Promise<ApiResult<{ items: RequestSlot[] }>>;
  create: (input: unknown, idempotencyKey: unknown) => Promise<ApiResult<{ id: string }>>;
};

export const NOTE_MAX = 200;
const radioClass = "mt-1 size-5 shrink-0 accent-forest focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus";

export function optionClass(selected: boolean, disabled = false) {
  return cn("flex min-h-target items-start gap-3 rounded-md border bg-surface px-4 py-3 text-base",
    disabled ? "cursor-not-allowed border-border text-muted" : selected ? "cursor-pointer border-forest text-ink ring-1 ring-forest" : "cursor-pointer border-border text-ink hover:border-forest");
}

/** A titled section of the request form. `id` is the error-summary target. */
export function FormSection({ id, title, error, children, describedBy }: { id: string; title: string; error?: string; describedBy?: string; children: ReactNode }) {
  return (
    <fieldset id={id} tabIndex={-1} aria-describedby={[error ? `${id}-error` : null, describedBy].filter(Boolean).join(" ") || undefined}
      className="grid gap-3 rounded-lg border border-border bg-surface p-5 focus:outline-none sm:p-6">
      <legend className="float-left mb-1 w-full text-lg font-semibold text-ink">{title}</legend>
      {error ? <InlineError id={`${id}-error`} message={error} /> : null}
      {children}
    </fieldset>
  );
}

export function PatientChoice({ id, members, value, onChange, error }: { id: string; members: PatientMember[]; value: string | null; onChange: (id: string) => void; error?: string }) {
  const t = useTranslations("services.common.form");
  const name = useId();
  const bookable = members.filter(member => member.relation === "self" || member.canBook);
  return (
    <FormSection id={id} title={t("patient")} error={error}>
      {bookable.map(member => (
        <label key={member.patientId} className={optionClass(value === member.patientId)}>
          <input type="radio" name={name} value={member.patientId} checked={value === member.patientId} onChange={() => onChange(member.patientId)} className={radioClass} />
          <span className="grid"><span className="font-semibold">{member.displayName}</span><span className="text-sm text-muted">{member.relation === "self" ? t("self") : t("family")}</span></span>
        </label>
      ))}
    </FormSection>
  );
}

export function AddressChoice({ id, title, providerName, pins, addresses, value, onChange, error, backHref }: {
  id: string; title?: string; providerName: string; pins: readonly string[]; addresses: PatientAddress[]; value: string | null; onChange: (id: string) => void; error?: string; backHref: string;
}) {
  const t = useTranslations("services.common.form");
  const ts = useTranslations("services.common.status");
  const name = useId();
  const covered = addresses.filter(address => pins.includes(address.pin));
  return (
    <FormSection id={id} title={title ?? t("address")} error={error} describedBy={`${id}-intro`}>
      <p id={`${id}-intro`} className="text-base text-ink">{t("addressIntro", { name: providerName, pins: pins.join(", ") })}</p>
      {addresses.map(address => {
        const ok = pins.includes(address.pin);
        return (
          <label key={address.id} className={optionClass(value === address.id, !ok)}>
            <input type="radio" name={name} value={address.id} checked={value === address.id} disabled={!ok} onChange={() => onChange(address.id)} className={radioClass} />
            <span className="grid">
              <span>{t("addressLine", { label: t(`labels.${address.label}`), locality: address.locality, city: address.city, pin: address.pin })}</span>
              {!ok ? <span className="text-sm">{t("outside")}</span> : null}
            </span>
          </label>
        );
      })}
      {covered.length === 0 ? <Notice tone="warning" title={t("noCoveredTitle")} action={<LinkAction href={backHref}>{ts("findAnother")}</LinkAction>}>{t("noCoveredBody")}</Notice> : null}
    </FormSection>
  );
}

/** Loads the provider's open times through a server action (advisory: the server re-checks on send). */
export function TimeChoice({ id, providerId, load, reloadKey, value, onChange, error, backHref, hours }: {
  id: string; providerId: string; load: RequestFormActions["slots"]; reloadKey: number; value: RequestSlot | null; onChange: (slot: RequestSlot | null) => void; error?: string; backHref: string;
  /** Length of the request in hours when the patient chose one; start times that cannot fit it are not offered. */
  hours?: number | null;
}) {
  const t = useTranslations("services.common.form");
  const ts = useTranslations("services.common.status");
  const [attempt, setAttempt] = useState(0);
  // Results are tagged with the request they answer, so a reload shows "loading" until its own answer arrives.
  const want = `${providerId}:${reloadKey}:${attempt}:${hours ?? ""}`;
  const [loaded, setLoaded] = useState<{ key: string; result: ApiResult<{ items: RequestSlot[] }> } | null>(null);
  const slots = loaded?.key === want ? loaded.result : null;
  useEffect(() => {
    let live = true;
    (hours ? load(providerId, hours) : load(providerId)).then(result => { if (live) setLoaded({ key: want, result }); }, () => { if (live) setLoaded({ key: want, result: { ok: false, error: { code: "unavailable" } } }); });
    return () => { live = false; };
  }, [load, providerId, hours, want]);
  const items = slots?.ok ? slots.data.items : [];
  const current = value && items.some(item => item.startAt === value.startAt) ? value : null;
  useEffect(() => { if (slots?.ok && value && !current) onChange(null); }, [slots, value, current, onChange]);
  return (
    <FormSection id={id} title={t("time")} error={error}>
      {slots === null ? <p role="status" className="flex items-center gap-2 text-base text-muted"><Loader2 aria-hidden className="size-5 animate-spin" />{t("loadingTimes")}</p>
        : !slots.ok ? <InlineError code={slots.error.code} action={<><Button type="button" variant="secondary" onClick={() => setAttempt(n => n + 1)}>{t("retry")}</Button><LinkAction href={backHref} variant="quiet">{ts("findAnother")}</LinkAction></>} />
        : items.length === 0 ? <Notice tone="neutral" title={t("noTimesTitle")} action={<LinkAction href={backHref}>{ts("findAnother")}</LinkAction>}>{t("noTimesBody")}</Notice>
        : <SlotPicker idPrefix={id} slots={items} value={current} onChange={onChange} />}
    </FormSection>
  );
}

export function NoteField({ id, label, value, onChange, error }: { id: string; label?: string; value: string; onChange: (value: string) => void; error?: string }) {
  const t = useTranslations("services.common.form");
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-surface p-5 sm:p-6">
      <label htmlFor={id} className="text-lg font-semibold text-ink">{label ?? t("note")}</label>
      <p id={`${id}-hint`} className="text-sm text-muted">{t("noteHint", { max: NOTE_MAX })}</p>
      {error ? <InlineError id={`${id}-error`} message={error} /> : null}
      <textarea id={id} value={value} maxLength={NOTE_MAX} rows={3} onChange={event => onChange(event.target.value)}
        aria-describedby={[`${id}-hint`, error ? `${id}-error` : null].filter(Boolean).join(" ")} aria-invalid={error ? true : undefined}
        className="min-h-24 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus" />
      <p className="text-sm text-muted tabular" aria-live="polite">{t("noteCount", { count: value.length, max: NOTE_MAX })}</p>
    </div>
  );
}

/** Price lines exactly as the server will snapshot them (provider-set, integer paise), payment method and policy consent. */
export function PriceAndPolicy({ id, lines, lineLabel, accepted, onAccept, error, slot }: {
  id: string; lines: RequestLine[] | null; lineLabel: (line: RequestLine) => string; accepted: boolean; onAccept: (value: boolean) => void; error?: string; slot: RequestSlot | null;
}) {
  const t = useTranslations("services.common.form");
  const locale = useLocale() as Locale;
  const total = lines?.reduce((sum, line) => sum + line.amountPaise, 0) ?? null;
  return (
    <FormSection id={id} title={t("price")} error={error}>
      <p className="text-sm text-muted">{t("priceNote")}</p>
      {lines && lines.length ? (
        <dl className="divide-y divide-border rounded-md border border-border" data-testid="request-price">
          {lines.map(line => (
            <div key={line.key} className="flex items-baseline justify-between gap-4 px-4 py-2">
              <dt className="text-base text-ink">{lineLabel(line)}{line.quantity > 1 ? <span className="text-muted tabular"> × {line.quantity}</span> : null}</dt>
              <dd className="text-base text-ink tabular">{formatPaise(line.amountPaise, locale)}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 px-4 py-3">
            <dt className="text-base font-semibold text-ink">{t("total")}</dt>
            <dd className="text-xl font-semibold text-ink tabular">{formatPaise(total ?? 0, locale)}</dd>
          </div>
        </dl>
      ) : null}
      {slot ? <p className="text-base text-ink tabular">{formatSlotFull(slot.startAt, locale)}</p> : null}
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1 rounded-md border border-border p-4"><dt className="text-sm font-medium text-muted">{t("payment")}</dt><dd className="text-base text-ink">{t("payAfter")}<span className="block text-sm text-muted">{t("onlineDisabled")}</span></dd></div>
        <div className="grid gap-1 rounded-md border border-border p-4"><dt className="text-sm font-medium text-muted">{t("policyTitle")}</dt><dd className="text-base text-ink">{t("policy")}</dd></div>
      </dl>
      <label className="flex min-h-target cursor-pointer items-start gap-3 text-base text-ink">
        <input type="checkbox" checked={accepted} onChange={event => onAccept(event.target.checked)} className={radioClass} aria-invalid={error ? true : undefined} />
        <span>{t("accept")}</span>
      </label>
    </FormSection>
  );
}

/** A consent or acknowledgement checkbox section (preparation, non-clinical scope, not an emergency). */
export function Acknowledge({ id, title, children, label, checked, onChange, error }: { id: string; title: string; children?: ReactNode; label: string; checked: boolean; onChange: (value: boolean) => void; error?: string }) {
  return (
    <FormSection id={id} title={title} error={error}>
      {children}
      <label className="flex min-h-target cursor-pointer items-start gap-3 text-base text-ink">
        <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className={radioClass} aria-invalid={error ? true : undefined} />
        <span>{label}</span>
      </label>
    </FormSection>
  );
}

/**
 * Validate with the module schema, send once per idempotency key, and open the request page on success.
 * A lost response keeps the key, so trying again cannot create a second request; any changed input after a
 * refusal gets a new key. `issues` maps a schema path to a localized message and the field to focus.
 */
export function useRequestSubmit<I>({ create, segment, parse, messageFor, onConflict }: {
  create: RequestFormActions["create"]; segment: string;
  parse: () => { success: true; data: I } | { success: false; issues: { path: PropertyKey[] }[] };
  messageFor: (field: string) => { fieldId: string; message: string } | null;
  onConflict: () => void;
}) {
  const router = useRouter();
  const key = useRef<string | null>(null);
  const [errors, setErrors] = useState<SummaryError[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const submit = useCallback(async () => {
    if (busy) return;
    setAttempt(n => n + 1);
    const parsed = parse();
    if (!parsed.success) {
      const seen = new Set<string>();
      const list: SummaryError[] = [];
      for (const issue of parsed.issues) {
        const entry = messageFor(String(issue.path[0] ?? ""));
        if (entry && !seen.has(entry.fieldId)) { seen.add(entry.fieldId); list.push(entry); }
      }
      setErrors(list); setFailure(null); setConflict(false);
      return;
    }
    setErrors([]); setFailure(null); setConflict(false); setBusy(true);
    key.current ??= crypto.randomUUID();
    const result = await create(parsed.data, key.current).catch(() => ({ ok: false as const, error: { code: "unavailable" as const } }));
    if (result.ok) { router.replace(`${segment}/requests/${result.data.id}`); return; }
    setBusy(false);
    if (result.error.code !== "unavailable") key.current = null;
    if (result.error.code === "conflict") { setConflict(true); onConflict(); return; }
    if (result.error.code === "validation" && result.error.fields?.addressId) {
      const entry = messageFor("addressId");
      if (entry) { setErrors([entry]); return; }
    }
    setFailure(result.error.code);
  }, [busy, parse, messageFor, create, router, segment, onConflict]);

  return { submit, busy, errors, attempt, failure, conflict, errorFor: (fieldId: string) => errors.find(error => error.fieldId === fieldId)?.message };
}

export function SubmitArea({ state, onSubmit, manual }: { state: ReturnType<typeof useRequestSubmit>; onSubmit: () => void; manual: string }) {
  const t = useTranslations("services.common.form");
  return (
    <div className="grid gap-4">
      <div aria-live="polite" className="grid gap-3 empty:hidden">
        {state.conflict ? <Notice tone="warning" title={t("conflictTitle")}>{t("conflictBody")}</Notice> : null}
        {state.failure ? <InlineError code={state.failure} /> : null}
      </div>
      <p className="text-sm text-muted">{manual}</p>
      <div>
        <Button type="button" size="lg" onClick={onSubmit} disabled={state.busy} aria-busy={state.busy || undefined}>
          {state.busy ? <Loader2 aria-hidden className="animate-spin" /> : null}{state.busy ? t("sending") : t("send")}
        </Button>
      </div>
    </div>
  );
}

export function FormErrors({ state }: { state: ReturnType<typeof useRequestSubmit> }) {
  return <ErrorSummary errors={state.errors} focusKey={state.attempt} />;
}

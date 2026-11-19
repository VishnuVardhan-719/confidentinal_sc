"use client";

import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Field } from "@/components/shared/field";
import { InlineError } from "@/components/shared/inline-error";
import { Notice } from "@/components/shared/notice";
import { Stepper, type StepItem } from "@/components/shared/stepper";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import type { ApiResult } from "@/lib/api/result";
import { formatPaise, type Locale } from "@/lib/format";
import type { Booking, CreateBooking } from "@/modules/bookings/schemas";
import type { Slot } from "@/modules/bookings/slots";
import { createBookingSubmitter } from "@/modules/bookings/submit";
import { createWizardState, wizardReducer, type WizardEvent, type WizardState, type WizardStep } from "@/modules/bookings/wizard-state";
import type { BookingReview } from "@/modules/bookings/wizard";
import { newAddressSchema, type BookingOffer, type NewAddress, type PatientAddress, type PatientMember } from "@/modules/patient/schemas";
import { PatientGate } from "./patient-gate";
import { formatSlotFull, SlotPicker } from "./slot-picker";

export type WizardDoctor = {
  providerId: string; serviceId: string; displayName: string; specialities: string; feePaise: number;
  area: { locality: string; city: string; pin: string }; synthetic: boolean;
};
export type WizardActions = {
  offer: (input: unknown) => Promise<ApiResult<BookingOffer>>;
  addAddress: (input: unknown) => Promise<ApiResult<{ id: string; items: PatientAddress[] }>>;
  slots: (input: unknown) => Promise<ApiResult<{ items: Slot[] }>>;
  prepare: (review: unknown) => Promise<ApiResult<CreateBooking>>;
  create: (input: unknown, key: unknown) => Promise<ApiResult<{ id: string }>>;
  get: (id: unknown) => Promise<ApiResult<Booking>>;
};

const VISIBLE: readonly Exclude<WizardStep, "result">[] = ["service", "patient", "location", "schedule", "details", "paymentPolicy", "review"];
const REASON_MAX = 240;

function initialState(doctor: WizardDoctor): WizardState {
  return wizardReducer(createWizardState(), { type: "save", step: "service", value: { providerId: doctor.providerId, serviceId: doctor.serviceId, category: "doctor" } });
}

/**
 * The patient booking wizard (doctor home visit). Seven visible steps on one page: doctor, patient, address,
 * time, note, fee and policy, review. State is transient (no storage or URL), every server value (slots, price,
 * policy) is fetched through server actions, and the request is sent once with one idempotency key. The result
 * is the server's booking, shown on its own request page.
 */
export function BookingWizard({ doctor, members, addresses: initialAddresses, actions }: { doctor: WizardDoctor; members: PatientMember[]; addresses: PatientAddress[]; actions: WizardActions }) {
  const t = useTranslations("booking.wizard");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [state, setState] = useState(() => initialState(doctor));
  const [addresses, setAddresses] = useState(initialAddresses);
  const [slots, setSlots] = useState<ApiResult<{ items: Slot[] }> | null>(null);
  const [offer, setOffer] = useState<ApiResult<BookingOffer> | null>(null);
  const [notice, setNotice] = useState<"slot_changed" | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const [submitter] = useState(() => createBookingSubmitter({ api: { create: actions.create, get: actions.get }, prepare: review => actions.prepare(review) }));
  const submission = useSyncExternalStore(submitter.subscribe, submitter.getSnapshot, submitter.getSnapshot);
  useEffect(() => () => submitter.dispose(), [submitter]);

  const dispatch = (event: WizardEvent) => setState(current => wizardReducer(current, event));
  const values = state.values;

  // Move focus to the step heading on every step change (not on first paint), so screen readers announce it.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus();
  }, [state.step]);

  // Load server data when its step opens. Results are kept until an earlier choice changes.
  useEffect(() => {
    if (state.step === "schedule" && slots === null) {
      let live = true;
      actions.slots({ providerId: doctor.providerId, serviceId: doctor.serviceId }).then(result => { if (live) setSlots(result); }, () => { if (live) setSlots({ ok: false, error: { code: "unavailable" } }); });
      return () => { live = false; };
    }
  }, [state.step, slots, actions, doctor.providerId, doctor.serviceId]);
  const schedule = values.schedule; const location = values.location;
  useEffect(() => {
    if (state.step === "paymentPolicy" && offer === null && schedule && location) {
      let live = true;
      actions.offer({ providerId: doctor.providerId, serviceId: doctor.serviceId, category: "doctor", pin: location.pin, startAt: schedule.startAt, endAt: schedule.endAt })
        .then(result => { if (live) setOffer(result); }, () => { if (live) setOffer({ ok: false, error: { code: "unavailable" } }); });
      return () => { live = false; };
    }
  }, [state.step, offer, schedule, location, actions, doctor.providerId, doctor.serviceId]);

  function save(step: Exclude<WizardStep, "result" | "review">, value: unknown) {
    if (step === "location" || step === "schedule") setOffer(null);
    setState(current => wizardReducer(wizardReducer(current, { type: "save", step, value }), { type: "next" }));
    setNotice(null);
  }

  async function send(confirmed: true) {
    const v = state.values;
    if (!v.service || !v.patient || !v.location || !v.schedule || !v.details || !v.paymentPolicy || !offer?.ok) return;
    const review: BookingReview = { service: v.service, patient: v.patient, location: v.location, schedule: v.schedule, details: v.details,
      paymentPolicy: v.paymentPolicy, confirmed, eligibilityVersion: offer.data.eligibilityVersion };
    const started = wizardReducer(wizardReducer(state, { type: "save", step: "review", value: review }), { type: "submit_started" });
    if (started.phase !== "submitting") { setState(started); return; }
    setState(started);
    const result = await submitter.submit(review);
    const revision = started.revision;
    if (result.phase === "resolved") {
      dispatch({ type: "submit_resolved", revision, booking: result.booking });
      router.replace(`/patient/book/${result.booking.id}`);
    } else if (result.phase === "uncertain") {
      dispatch({ type: "submit_uncertain", revision });
    } else if (result.phase === "failed") {
      dispatch({ type: "submit_rejected", revision, code: result.error.code });
      if (result.error.code === "conflict") {
        // The time or price changed on the server: fetch fresh slots and ask for a new time.
        setSlots(null); setOffer(null); setNotice("slot_changed");
        dispatch({ type: "go", step: "schedule" });
      }
    }
  }

  async function reconcile() {
    const result = await submitter.reconcile();
    if (result.phase === "resolved" || result.phase === "review_required") router.replace(`/patient/book/${result.booking.id}`);
  }

  const index = VISIBLE.indexOf(state.step as (typeof VISIBLE)[number]);
  const steps: StepItem[] = VISIBLE.map((step, i) => ({ id: step, label: t(`steps.${step}`), state: i < index || state.step === "result" ? "complete" : i === index ? "current" : "upcoming" }));
  const locked = state.phase !== "editing";
  const member = members.find(item => item.patientId === values.patient?.patientId);
  const address = addresses.find(item => item.id === values.location?.addressId);
  const fee = formatPaise(doctor.feePaise, locale);

  return (
    <div className="grid gap-8">
      <Stepper steps={steps} />
      <section aria-labelledby="wizard-step-title" className="grid gap-6 rounded-lg border border-border bg-surface p-5 sm:p-8">
        <div className="grid gap-1">
          {/* "Step n of 7" comes from the Stepper above (visible on phones, screen-reader text on wider screens). */}
          <h2 id="wizard-step-title" ref={headingRef} tabIndex={-1} className="font-display text-2xl font-medium text-ink focus:outline-none">
            {state.step === "result" ? t("result.title") : t(`${state.step}.title`)}
          </h2>
        </div>
        {notice === "slot_changed" && state.step === "schedule" ? <Notice tone="warning" title={t("schedule.changedTitle")}>{t("schedule.changedBody")}</Notice> : null}
        {state.issues.some(issue => issue.code === "review_required") && state.step === "paymentPolicy" ? <Notice tone="warning" title={t("paymentPolicy.changedTitle")}>{t("paymentPolicy.changedBody")}</Notice> : null}

        {state.step === "service" ? (
          <div className="grid gap-6">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact label={t("service.doctor")}>{doctor.displayName}<span className="block text-sm text-muted">{doctor.specialities}</span></Fact>
              <Fact label={t("service.visit")}>{t("service.homeVisit")}</Fact>
              <Fact label={t("service.fee")}><span className="tabular">{fee}</span><span className="block text-sm text-muted">{t("service.feeNote")}</span></Fact>
              <Fact label={t("service.area")}>{t("service.areaValue", { locality: doctor.area.locality, city: doctor.area.city, pin: doctor.area.pin })}</Fact>
            </dl>
            <p className="text-sm text-muted">{t("service.manual")}</p>
            <div><Button type="button" onClick={() => dispatch({ type: "next" })}>{t("continue")}</Button></div>
          </div>
        ) : null}

        {state.step === "patient" ? <PatientGate members={members} onContinue={result => save("patient", { patientId: result.patientId, access: result.access, questionnaireComplete: true })} /> : null}

        {state.step === "location" ? (
          <LocationStep doctor={doctor} addresses={addresses} selected={values.location?.addressId}
            onAdded={setAddresses} addAddress={actions.addAddress}
            onContinue={chosen => save("location", { addressId: chosen.id, pin: chosen.pin })} />
        ) : null}

        {state.step === "schedule" ? (
          <ScheduleStep slots={slots} selected={values.schedule ?? null} onRetry={() => setSlots(null)} onContinue={slot => save("schedule", slot)} />
        ) : null}

        {state.step === "details" ? (
          <DetailsStep initial={values.details?.category === "doctor" ? values.details.visitReason ?? "" : ""}
            onContinue={reason => save("details", { category: "doctor", ...(reason ? { visitReason: reason } : {}) })} />
        ) : null}

        {state.step === "paymentPolicy" ? (
          <PolicyStep offer={offer} onRetry={() => setOffer(null)}
            onContinue={data => save("paymentPolicy", { method: "pay_after", priceSnapshot: data.priceSnapshot, approvedPolicyVersionId: data.policy.id, accepted: true, noticeVersion: data.noticeVersion })} />
        ) : null}

        {state.step === "review" || state.step === "result" ? (
          <ReviewStep
            rows={[
              { step: "service", label: t("service.doctor"), value: doctor.displayName },
              { step: "patient", label: t("review.patient"), value: member?.displayName ?? "" },
              { step: "location", label: t("review.address"), value: address ? t("location.addressValue", { label: t(`location.labels.${address.label}`), locality: address.locality, city: address.city, pin: address.pin }) : "" },
              { step: "schedule", label: t("review.time"), value: values.schedule ? formatSlotFull(values.schedule.startAt, locale) : "" },
              { step: "details", label: t("review.note"), value: values.details?.category === "doctor" && values.details.visitReason ? values.details.visitReason : t("review.noNote") },
              { step: "paymentPolicy", label: t("review.fee"), value: values.paymentPolicy ? formatPaise(values.paymentPolicy.priceSnapshot.amountPaise, locale) : "" },
              { step: "paymentPolicy", label: t("review.payment"), value: t("paymentPolicy.payAfter") },
            ]}
            locked={locked}
            onEdit={step => dispatch({ type: "go", step })}
            submitting={submission.phase === "preparing" || submission.phase === "submitting" || state.phase === "result"}
            onSend={() => void send(true)}
          />
        ) : null}

        {state.step !== "service" && state.step !== "result" ? (
          <div><Button type="button" variant="quiet" onClick={() => dispatch({ type: "back" })} disabled={locked}><ArrowLeft aria-hidden />{t("back")}</Button></div>
        ) : null}

        <div aria-live="polite" className="empty:hidden">
          {state.phase === "result" ? <Notice tone="info" title={t("result.title")}>{t("result.opening")}</Notice> : null}
          {submission.phase === "uncertain" ? (
            <Notice tone="warning" title={t("result.uncertainTitle")} action={<Button type="button" variant="secondary" onClick={() => void reconcile()}>{t("result.checkAgain")}</Button>}>{t("result.uncertainBody")}</Notice>
          ) : null}
          {submission.phase === "review_required" ? (
            <Notice tone="warning" title={t("result.differsTitle")} action={<Button type="button" variant="secondary" onClick={() => router.replace(`/patient/book/${submission.booking.id}`)}>{t("result.open")}</Button>}>{t("result.differsBody")}</Notice>
          ) : null}
          {submission.phase === "failed" && submission.error.code !== "conflict" ? <InlineError code={submission.error.code} /> : null}
        </div>
      </section>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 rounded-md border border-border p-4">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="text-base font-semibold text-ink">{children}</dd>
    </div>
  );
}

function LocationStep({ doctor, addresses, selected, onAdded, addAddress, onContinue }: {
  doctor: WizardDoctor; addresses: PatientAddress[]; selected?: string; onAdded: (items: PatientAddress[]) => void;
  addAddress: WizardActions["addAddress"]; onContinue: (address: PatientAddress) => void;
}) {
  const t = useTranslations("booking.wizard.location");
  const tw = useTranslations("booking.wizard");
  const uid = useId();
  const covered = (address: PatientAddress) => address.pin === doctor.area.pin;
  const [choice, setChoice] = useState(() => selected ?? addresses.find(covered)?.id);
  const [adding, setAdding] = useState(addresses.length === 0);
  const [error, setError] = useState(false);
  const chosen = addresses.find(item => item.id === choice && covered(item));
  return (
    <div className="grid gap-6">
      <p className="text-base text-ink">{t("intro", { pin: doctor.area.pin, city: doctor.area.city })}</p>
      {addresses.length ? (
        <fieldset className="grid gap-3" aria-describedby={error ? `${uid}-error` : undefined}>
          <legend className="mb-2 text-base font-semibold text-ink">{t("saved")}</legend>
          {addresses.map(item => {
            const ok = covered(item);
            return (
              <label key={item.id} className={cn("flex min-h-target items-start gap-3 rounded-md border bg-surface px-4 py-3 text-base",
                !ok ? "cursor-not-allowed border-border text-muted" : item.id === choice ? "cursor-pointer border-forest ring-1 ring-forest text-ink" : "cursor-pointer border-border text-ink hover:border-forest")}>
                <input type="radio" name={`${uid}-address`} value={item.id} checked={item.id === choice} disabled={!ok}
                  onChange={() => { setChoice(item.id); setError(false); }} className="mt-1 size-5 accent-forest focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus" />
                <span className="grid">
                  <span className="font-semibold">{t(`labels.${item.label}`)}</span>
                  <span>{t("line", { locality: item.locality, city: item.city, pin: item.pin })}</span>
                  {!ok ? <span className="text-sm">{t("outside")}</span> : null}
                </span>
              </label>
            );
          })}
        </fieldset>
      ) : null}
      {error ? <InlineError id={`${uid}-error`} message={t("chooseCovered", { pin: doctor.area.pin })} /> : null}
      {adding ? (
        <AddressForm defaultPin={doctor.area.pin} addAddress={addAddress} onCancel={addresses.length ? () => setAdding(false) : undefined}
          onAdded={(id, items) => { onAdded(items); setAdding(false); const added = items.find(item => item.id === id); if (added && covered(added)) setChoice(id); }} />
      ) : (
        <div><Button type="button" variant="secondary" onClick={() => setAdding(true)}><Plus aria-hidden />{t("add")}</Button></div>
      )}
      <div><Button type="button" onClick={() => (chosen ? onContinue(chosen) : setError(true))}>{tw("continue")}</Button></div>
    </div>
  );
}

function AddressForm({ defaultPin, addAddress, onAdded, onCancel }: { defaultPin: string; addAddress: WizardActions["addAddress"]; onAdded: (id: string, items: PatientAddress[]) => void; onCancel?: () => void }) {
  const t = useTranslations("booking.wizard.location");
  const uid = useId();
  const [draft, setDraft] = useState<NewAddress>({ label: "home", locality: "", city: "", pin: defaultPin });
  const [errors, setErrors] = useState<Partial<Record<keyof NewAddress, string>>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  async function submit() {
    const parsed = newAddressSchema.safeParse(draft);
    if (!parsed.success) {
      const next: Partial<Record<keyof NewAddress, string>> = {};
      for (const issue of parsed.error.issues) { const key = issue.path[0] as keyof NewAddress; next[key] ??= t(`errors.${key}`); }
      setErrors(next);
      const first = (["locality", "city", "pin"] as const).find(key => next[key]);
      if (first) document.getElementById(`${uid}-${first}`)?.focus();
      return;
    }
    setErrors({}); setBusy(true); setFailure(null);
    const result = await addAddress(parsed.data).catch(() => ({ ok: false as const, error: { code: "unavailable" as const } }));
    setBusy(false);
    if (result.ok) onAdded(result.data.id, result.data.items); else setFailure(result.error.code);
  }
  return (
    <div className="grid gap-4 rounded-md border border-border-strong p-4 sm:p-5" role="group" aria-labelledby={`${uid}-title`}>
      <h3 id={`${uid}-title`} className="text-lg font-semibold text-ink">{t("newTitle")}</h3>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-base font-semibold text-ink">{t("labelField")}</legend>
        <div className="flex flex-wrap gap-2">
          {(["home", "work", "other"] as const).map(label => (
            <label key={label} className={cn("flex min-h-target cursor-pointer items-center gap-2 rounded-md border px-3", draft.label === label ? "border-forest ring-1 ring-forest" : "border-border")}>
              <input type="radio" name={`${uid}-label`} value={label} checked={draft.label === label} onChange={() => setDraft({ ...draft, label })} className="size-5 accent-forest" />
              {t(`labels.${label}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <Field id={`${uid}-locality`} label={t("locality")} hint={t("localityHint")} error={errors.locality} required>
        {control => <Input {...control} value={draft.locality} maxLength={80} autoComplete="address-line2" onChange={event => setDraft({ ...draft, locality: event.target.value })} />}
      </Field>
      <Field id={`${uid}-city`} label={t("city")} error={errors.city} required>
        {control => <Input {...control} value={draft.city} maxLength={60} autoComplete="address-level2" onChange={event => setDraft({ ...draft, city: event.target.value })} />}
      </Field>
      <Field id={`${uid}-pin`} label={t("pin")} error={errors.pin} required>
        {control => <Input {...control} value={draft.pin} inputMode="numeric" maxLength={6} autoComplete="postal-code" onChange={event => setDraft({ ...draft, pin: event.target.value.replace(/\D/g, "") })} />}
      </Field>
      {failure ? <InlineError code={failure} /> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => void submit()} disabled={busy}>{busy ? <Loader2 aria-hidden className="animate-spin" /> : null}{t("save")}</Button>
        {onCancel ? <Button type="button" variant="quiet" onClick={onCancel}>{t("cancel")}</Button> : null}
      </div>
    </div>
  );
}

function ScheduleStep({ slots, selected, onRetry, onContinue }: { slots: ApiResult<{ items: Slot[] }> | null; selected: Slot | null; onRetry: () => void; onContinue: (slot: Slot) => void }) {
  const t = useTranslations("booking.wizard");
  const [slot, setSlot] = useState<Slot | null>(selected);
  const [error, setError] = useState(false);
  if (slots === null) return <p className="flex items-center gap-2 text-base text-muted" role="status"><Loader2 aria-hidden className="size-5 animate-spin" />{t("schedule.loading")}</p>;
  if (!slots.ok) return <InlineError code={slots.error.code} action={<Button type="button" variant="secondary" onClick={onRetry}>{t("retry")}</Button>} />;
  if (slots.data.items.length === 0) return <Notice tone="neutral" title={t("schedule.emptyTitle")}>{t("schedule.emptyBody")}</Notice>;
  const valid = slot && slots.data.items.some(item => item.startAt === slot.startAt);
  return (
    <div className="grid gap-6">
      <SlotPicker slots={slots.data.items} value={valid ? slot : null} onChange={value => { setSlot(value); setError(false); }} />
      {error ? <InlineError message={t("schedule.required")} /> : null}
      <div><Button type="button" onClick={() => (valid && slot ? onContinue(slot) : setError(true))}>{t("continue")}</Button></div>
    </div>
  );
}

function DetailsStep({ initial, onContinue }: { initial: string; onContinue: (reason: string) => void }) {
  const t = useTranslations("booking.wizard");
  const uid = useId();
  const [reason, setReason] = useState(initial);
  return (
    <div className="grid gap-6">
      <Field id={`${uid}-reason`} label={t("details.label")} hint={t("details.hint", { max: REASON_MAX })}>
        {control => (
          <textarea {...control} value={reason} maxLength={REASON_MAX} rows={4} onChange={event => setReason(event.target.value)}
            className="min-h-28 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus" />
        )}
      </Field>
      <p className="text-sm text-muted tabular" aria-live="polite">{t("details.count", { count: reason.length, max: REASON_MAX })}</p>
      <div><Button type="button" onClick={() => onContinue(reason.trim())}>{t("continue")}</Button></div>
    </div>
  );
}

function PolicyStep({ offer, onRetry, onContinue }: { offer: ApiResult<BookingOffer> | null; onRetry: () => void; onContinue: (offer: BookingOffer) => void }) {
  const t = useTranslations("booking.wizard");
  const locale = useLocale() as Locale;
  const uid = useId();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState(false);
  if (offer === null) return <p className="flex items-center gap-2 text-base text-muted" role="status"><Loader2 aria-hidden className="size-5 animate-spin" />{t("paymentPolicy.loading")}</p>;
  if (!offer.ok) return <InlineError code={offer.error.code} action={<Button type="button" variant="secondary" onClick={onRetry}>{t("retry")}</Button>} />;
  const data = offer.data;
  const hours = Math.round(data.policy.cancelWindowMinutes / 60);
  return (
    <div className="grid gap-6">
      <dl className="grid gap-4 sm:grid-cols-2">
        <Fact label={t("paymentPolicy.fee")}><span className="text-2xl tabular">{formatPaise(data.priceSnapshot.amountPaise, locale)}</span><span className="block text-sm font-normal text-muted">{t("paymentPolicy.feeNote")}</span></Fact>
        <Fact label={t("paymentPolicy.cancellation")}><span className="font-normal">{t("paymentPolicy.cancellationValue", { hours })}</span></Fact>
      </dl>
      {!data.policy.approved ? <Notice tone="neutral" title={t("paymentPolicy.syntheticPolicyTitle")}>{t("paymentPolicy.syntheticPolicyBody")}</Notice> : null}
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-base font-semibold text-ink">{t("paymentPolicy.method")}</legend>
        <label className="flex min-h-target cursor-pointer items-start gap-3 rounded-md border border-forest bg-surface px-4 py-3 ring-1 ring-forest">
          <input type="radio" name={`${uid}-method`} value="pay_after" defaultChecked className="mt-1 size-5 accent-forest" />
          <span className="grid"><span className="font-semibold text-ink">{t("paymentPolicy.payAfter")}</span><span className="text-sm text-muted">{t("paymentPolicy.payAfterHint")}</span></span>
        </label>
        <label className="flex min-h-target cursor-not-allowed items-start gap-3 rounded-md border border-border bg-surface px-4 py-3 text-muted">
          <input type="radio" name={`${uid}-method`} value="online" disabled aria-describedby={`${uid}-online`} className="mt-1 size-5" />
          <span className="grid"><span className="font-semibold">{t("paymentPolicy.online")}</span><span id={`${uid}-online`} className="text-sm">{t("paymentPolicy.onlineDisabled")}</span></span>
        </label>
      </fieldset>
      <div className="grid gap-2">
        <label htmlFor={`${uid}-accept`} className="flex min-h-target cursor-pointer items-start gap-3 text-base text-ink">
          <input id={`${uid}-accept`} type="checkbox" checked={accepted} aria-invalid={error || undefined} aria-describedby={error ? `${uid}-accept-error` : undefined}
            onChange={event => { setAccepted(event.target.checked); if (event.target.checked) setError(false); }} className="mt-0.5 size-5 shrink-0 accent-forest" />
          <span>{t("paymentPolicy.accept")}</span>
        </label>
        {error ? <InlineError id={`${uid}-accept-error`} message={t("paymentPolicy.acceptRequired")} /> : null}
      </div>
      <div><Button type="button" onClick={() => (accepted ? onContinue(data) : (setError(true), document.getElementById(`${uid}-accept`)?.focus()))}>{t("continue")}</Button></div>
    </div>
  );
}

function ReviewStep({ rows, locked, onEdit, submitting, onSend }: {
  rows: { step: WizardStep; label: string; value: string }[]; locked: boolean; onEdit: (step: WizardStep) => void; submitting: boolean; onSend: () => void;
}) {
  const t = useTranslations("booking.wizard");
  const uid = useId();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div className="grid gap-6">
      <dl className="divide-y divide-border rounded-md border border-border">
        {rows.map(row => (
          <div key={row.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
            <dt className="text-sm font-medium text-muted">{row.label}</dt>
            <dd className="text-base break-words text-ink">{row.value}</dd>
            <dd><Button type="button" variant="quiet" disabled={locked} onClick={() => onEdit(row.step)} aria-label={t("review.change", { item: row.label })}>{t("review.changeShort")}</Button></dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted">{t("review.manual")}</p>
      <div className="grid gap-2">
        <label htmlFor={`${uid}-confirm`} className="flex min-h-target cursor-pointer items-start gap-3 text-base text-ink">
          <input id={`${uid}-confirm`} type="checkbox" checked={confirmed} disabled={locked} aria-invalid={error || undefined} aria-describedby={error ? `${uid}-confirm-error` : undefined}
            onChange={event => { setConfirmed(event.target.checked); if (event.target.checked) setError(false); }} className="mt-0.5 size-5 shrink-0 accent-forest" />
          <span>{t("review.confirm")}</span>
        </label>
        {error ? <InlineError id={`${uid}-confirm-error`} message={t("review.confirmRequired")} /> : null}
      </div>
      <div>
        <Button type="button" size="lg" disabled={locked || submitting} aria-busy={submitting || undefined}
          onClick={() => (confirmed ? onSend() : (setError(true), document.getElementById(`${uid}-confirm`)?.focus()))}>
          {submitting ? <Loader2 aria-hidden className="animate-spin" /> : null}{submitting ? t("review.sending") : t("review.send")}
        </Button>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { categories } from "@/app/categories/data";
import { ButtonLink } from "@/components/button-link";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ErrorState, Loading } from "@/components/ui/states";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import {
  PATIENT_POLICY_VERSION,
  PAYMENT_LABEL,
  SLUG_TO_CATEGORY,
  STATE_LABEL,
  bookingSchema,
  choiceKey,
  prefillFromParams,
  slotsSchema,
  type Booking,
  type CatalogRow,
  type CategorySlug,
} from "@/lib/client/booking";
import { UNIT_LABEL, formatDateKey, formatPaise, formatSlot, istDate } from "@/lib/client/format";
import { useCatalogSearch } from "@/lib/client/use-catalog";
import { useRequest } from "@/lib/client/use-request";
import { uuid } from "@/lib/client/uuid";
import { ChoiceList } from "./choice-list";
import { EmptyPanel } from "./empty-panel";
import { Icon } from "./icons";
import { bookingAreaSchema, bookingChoiceSchema, bookingDetailsSchema, bookingServiceSchema, toE164 } from "./schemas";
import { useSignedIn } from "./session-gate";
import { SlotPicker } from "./slot-picker";
import { ReviewList, StepActions, Stepper } from "./stepper";
import { stepErrors, type StepDef } from "./steps";
import { focusFirstError, useFlow } from "./use-flow";

type Values = {
  service?: CategorySlug;
  pin: string;
  /** `${provider_reference}|${service_id}` of the chosen catalog row. */
  choice?: string;
  date?: string;
  slot?: string;
  line1: string;
  locality: string;
  contactName: string;
  phone: string;
  consent: boolean;
};

export const BOOKING_STEPS: readonly StepDef[] = [
  { id: "service", title: "Service" },
  { id: "area", title: "PIN code" },
  { id: "provider", title: "Provider and time" },
  { id: "details", title: "Address and contact" },
  { id: "review", title: "Review" },
];

const STEP_SCHEMAS = [bookingServiceSchema, bookingAreaSchema, bookingChoiceSchema, bookingDetailsSchema];

/** list_slots accepts today through 31 days ahead, in India time. */
const MAX_DAYS_AHEAD = 31;

const serviceChoices = categories.map((c) => ({
  value: c.slug as CategorySlug,
  label: c.name,
  description: c.summary,
  note: c.slug === "scheduled-ambulance" ? "Planned journeys only. In an emergency in India, call 112." : undefined,
}));

type Sent = { id: string; booking: Booking | null };

/** Messages for sending a request, where a generic "not allowed" would not tell people what to do. */
function sendErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "This provider cannot take a request for this PIN code right now. Choose another provider or time.";
    if (error.status === 422) return "That time can no longer be requested. Go back and choose another time.";
    if (error.status === 429) return "You have too many open requests or saved addresses right now. Cancel an open request, or try again later.";
    if (error.status === 409) return "This request changed while it was being sent. Check your visits before trying again.";
  }
  return errorMessage(error);
}

/**
 * Patient booking request, against the live API:
 * catalog search (GET /api/catalog) -> advisory times (GET /api/availability, by provider reference) ->
 * patient record and address (POST /api/auth/patient, POST /api/patient/addresses) ->
 * request (POST /api/bookings with an Idempotency-Key). The server derives and snapshots the price;
 * the price shown before sending is the provider's current listed price.
 */
export function BookingFlow() {
  const account = useSignedIn();
  const params = useSearchParams();
  const [prefill] = useState(() => prefillFromParams(params));
  const flow = useFlow(BOOKING_STEPS.length, prefill.service ? (prefill.pin ? 2 : 1) : 0);
  const [values, setValues] = useState<Values>({
    service: prefill.service,
    pin: prefill.pin ?? "",
    choice: prefill.provider ? `${prefill.provider}|${prefill.serviceId}` : undefined,
    line1: "",
    locality: "",
    contactName: account.name,
    phone: "",
    consent: false,
  });
  const [selected, setSelected] = useState<CatalogRow | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  // Reused across retries of the same request, so a lost response cannot create a second booking.
  const requestKey = useRef<string | null>(null);
  const saved = useRef<{ patientId?: string; address?: { id: string; signature: string } }>({});

  const set = (patch: Partial<Values>) => {
    requestKey.current = null;
    setSendError(null);
    setValues((v) => ({ ...v, ...patch }));
  };

  function submitStep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const schema = STEP_SCHEMAS[flow.step];
    const found = schema ? stepErrors(schema, values) : {};
    if (flow.step === 2 && !found.choice && !selected) found.choice = "Choose a provider and service.";
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstError(event.currentTarget, found);
      return;
    }
    flow.advance();
  }

  function openStep(index: number) {
    setErrors({});
    flow.open(index);
  }

  async function send() {
    if (!selected || !values.slot || !values.service) return;
    const phone = toE164(values.phone);
    if (!phone || !bookingDetailsSchema.safeParse(values).success) return;
    setSending(true);
    setSendError(null);
    try {
      const patientId =
        saved.current.patientId ??
        (
          await api<{ patientId: string }>("/api/auth/patient", {
            method: "POST",
            auth: true,
            body: { policyVersion: PATIENT_POLICY_VERSION, consent: true },
          })
        ).patientId;
      saved.current.patientId = patientId;

      const address = {
        patientId,
        line1: values.line1.trim(),
        locality: values.locality.trim(),
        pin: values.pin.trim(),
        contactName: values.contactName.trim(),
        phone,
      };
      const signature = JSON.stringify(address);
      let addressId = saved.current.address?.signature === signature ? saved.current.address.id : null;
      if (!addressId) {
        addressId = (await api<{ id: string }>("/api/patient/addresses", { method: "POST", auth: true, body: { ...address, expectedVersion: 0 } })).id;
        saved.current.address = { id: addressId, signature };
        requestKey.current = null;
      }

      requestKey.current ??= uuid();
      const { id } = await api<{ id: string }>("/api/bookings", {
        method: "POST",
        auth: true,
        idempotencyKey: requestKey.current,
        body: { patientId, serviceId: selected.service_id, addressId, startAt: new Date(values.slot).toISOString() },
      });
      // The confirmation shows the server's own record: its reference, state and snapshotted price.
      const booking = await api<{ booking: unknown }>(`/api/bookings/${id}`, { auth: true })
        .then((body) => bookingSchema.parse(body.booking))
        .catch(() => null);
      setSent({ id, booking });
    } catch (error) {
      setSendError(sendErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  const heading = (text: string) => (
    <h2
      ref={flow.headingRef}
      tabIndex={-1}
      className="mb-6 font-sans text-[1.375rem] leading-snug font-bold tracking-normal outline-none"
    >
      {text}
    </h2>
  );

  if (sent) {
    return (
      <Confirmation
        sent={sent}
        row={selected}
        slot={values.slot}
        onAnother={() => {
          setSent(null);
          setSelected(null);
          requestKey.current = null;
          setValues((v) => ({ ...v, service: undefined, choice: undefined, date: undefined, slot: undefined }));
          setErrors({});
          flow.reset();
        }}
      />
    );
  }

  const title = BOOKING_STEPS[flow.step]!.title;
  return (
    <div className="max-w-[46rem]">
      <Stepper steps={BOOKING_STEPS} current={flow.step} furthest={flow.furthest} onOpen={openStep} label="Request steps" />

      {flow.step === 0 ? (
        <form noValidate onSubmit={submitStep} aria-label={title}>
          {heading("What kind of care do you need?")}
          <ChoiceList
            legend="Service type"
            name="service"
            choices={serviceChoices}
            value={values.service}
            onChange={(service) => {
              if (service === values.service) return;
              // A different service type means a different provider list, so clear the later choices.
              setSelected(null);
              set({ service, choice: undefined, date: undefined, slot: undefined });
            }}
            error={errors.service}
          />
          <StepActions />
        </form>
      ) : null}

      {flow.step === 1 ? (
        <form noValidate onSubmit={submitStep} aria-label={title}>
          {heading("Where should the visit happen?")}
          <FormField
            label="PIN code"
            required
            hint="Only providers who serve this PIN code are shown. The visit address must be in this PIN code."
            error={errors.pin}
          >
            <Input
              name="pin"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              value={values.pin}
              onChange={(e) => {
                const pin = e.target.value.replace(/\D/g, "");
                if (pin === values.pin) return;
                setSelected(null);
                set({ pin, choice: undefined, date: undefined, slot: undefined });
              }}
              className="max-w-[12rem] tabular-nums"
            />
          </FormField>
          <StepActions onBack={flow.back} />
        </form>
      ) : null}

      {flow.step === 2 && values.service ? (
        <form noValidate onSubmit={submitStep} aria-label={title}>
          {heading("Choose a provider and time")}
          <ProviderStep
            service={values.service}
            pin={values.pin.trim()}
            values={values}
            selected={selected}
            onSelect={(row) => {
              setSelected(row);
              if (!row) set({ choice: undefined, slot: undefined });
              else if (choiceKey(row) !== values.choice) set({ choice: choiceKey(row), slot: undefined });
            }}
            set={set}
            errors={errors}
          />
          <StepActions onBack={flow.back} />
        </form>
      ) : null}

      {flow.step === 3 ? (
        <form noValidate onSubmit={submitStep} aria-label={title}>
          {heading("Where and who should the provider contact?")}
          <DetailsStep values={values} set={set} errors={errors} />
          <StepActions onBack={flow.back} />
        </form>
      ) : null}

      {flow.step === 4 ? (
        <Review
          values={values}
          row={selected}
          heading={heading("Check your request")}
          onChange={openStep}
          onBack={flow.back}
          onSend={() => void send()}
          sending={sending}
          error={sendError}
        />
      ) : null}
    </div>
  );
}

function ProviderStep({
  service,
  pin,
  values,
  selected,
  onSelect,
  set,
  errors,
}: {
  service: CategorySlug;
  pin: string;
  values: Values;
  selected: CatalogRow | null;
  onSelect: (row: CatalogRow | null) => void;
  set: (patch: Partial<Values>) => void;
  errors: Record<string, string>;
}) {
  const catalog = useCatalogSearch(SLUG_TO_CATEGORY[service], pin);
  // The row named by a link (or chosen before), kept to explain if the catalog no longer lists it.
  const [linked] = useState(values.choice);
  const noun = categories.find((c) => c.slug === service)?.name.toLowerCase() ?? "this service";
  const missing =
    catalog.status === "ready" && Boolean(linked) && !catalog.next && !catalog.rows.some((r) => choiceKey(r) === linked);

  // Adopt the named row once the catalog confirms it exists; drop it if the full list does not have it.
  useEffect(() => {
    if (catalog.status !== "ready" || !values.choice || selected) return;
    const row = catalog.rows.find((r) => choiceKey(r) === values.choice);
    if (row) onSelect(row);
    else if (!catalog.next) onSelect(null);
  }, [catalog.status, catalog.rows, catalog.next, values.choice, selected, onSelect]);

  if (catalog.status === "loading" || catalog.status === "idle") return <Loading label="Finding providers for your PIN code" />;
  if (catalog.status === "error") {
    return (
      <ErrorState
        headingLevel="h3"
        title="Providers could not be loaded"
        message={errorMessage(catalog.error)}
        onRetry={catalog.retry}
      />
    );
  }
  if (catalog.rows.length === 0) {
    return (
      <EmptyPanel
        icon="calendar"
        title={`No providers for ${noun} serve PIN code ${pin} yet`}
        actions={<ButtonLink href="/categories" variant="secondary">See all services</ButtonLink>}
      >
        <p>Only providers whose details have been checked, and who cover your PIN code, are listed. Try another PIN code or service.</p>
      </EmptyPanel>
    );
  }

  const choices = catalog.rows.map((row) => ({
    value: choiceKey(row),
    label: row.display_name,
    description: `${row.service_title} · ${formatPaise(row.amount_paise)} ${UNIT_LABEL[row.unit] ?? ""} · about ${row.duration_minutes} minutes · ${row.city}`,
    note: [row.public_profile?.specialty, row.public_profile?.qualification, row.public_profile?.languages?.join(", ")]
      .filter(Boolean)
      .join(" · ") || undefined,
  }));

  return (
    <div className="grid gap-8">
      {missing ? (
        <p role="status" className="border-l-2 border-[var(--warning)] pl-4 text-[0.9375rem]">
          The provider from your link is not available for PIN code {pin} right now. Choose one of the providers below.
        </p>
      ) : null}
      <div className="grid gap-3">
        <ChoiceList
          legend="Provider and service"
          name="choice"
          choices={choices}
          value={selected ? choiceKey(selected) : undefined}
          onChange={(key) => onSelect(catalog.rows.find((r) => choiceKey(r) === key) ?? null)}
          error={errors.choice}
        />
        {catalog.next ? (
          <div>
            <Button variant="secondary" onClick={catalog.loadMore} loading={catalog.more === "loading"}>
              Show more providers
            </Button>
            {catalog.more === "error" ? (
              <p role="alert" className="mt-2 text-sm font-medium text-[var(--warning)]">
                {errorMessage(catalog.moreError)}
              </p>
            ) : null}
          </div>
        ) : null}
        <p className="text-[0.9375rem] text-[var(--ink-soft)]">Prices are set by each provider. Nothing is charged online.</p>
      </div>
      {selected ? <TimeStep row={selected} values={values} set={set} errors={errors} /> : null}
    </div>
  );
}

function TimeStep({
  row,
  values,
  set,
  errors,
}: {
  row: CatalogRow;
  values: Values;
  set: (patch: Partial<Values>) => void;
  errors: Record<string, string>;
}) {
  const min = istDate(0);
  const max = istDate(MAX_DAYS_AHEAD);
  const date = values.date && values.date >= min && values.date <= max ? values.date : null;
  const key = date ? `${row.provider_reference}|${row.service_id}|${date}` : null;
  const slots = useRequest(key, (signal) =>
    api<unknown>("/api/availability", {
      auth: true,
      query: { provider: row.provider_reference, service: row.service_id, date },
      signal,
    }).then((body) => slotsSchema.parse(body).slots.map((s) => s.start_at)),
  );

  return (
    <div className="grid gap-6 border-t border-[var(--line)] pt-6">
      <FormField
        label="Date"
        required
        hint={`India time. You can ask for a date from today up to ${MAX_DAYS_AHEAD} days ahead.`}
        error={errors.date ?? (values.date && !date ? `Choose a date between ${formatDateKey(min)} and ${formatDateKey(max)}.` : undefined)}
      >
        <Input
          type="date"
          name="date"
          min={min}
          max={max}
          value={values.date ?? ""}
          onChange={(e) => set({ date: e.target.value || undefined, slot: undefined })}
          className="max-w-[14rem]"
        />
      </FormField>

      {!date ? null : slots.status === "loading" || slots.status === "idle" ? (
        <Loading label="Checking free times" />
      ) : slots.status === "error" ? (
        <ErrorState headingLevel="h3" title="Times could not be loaded" message={errorMessage(slots.error)} onRetry={slots.retry} />
      ) : slots.data.length === 0 ? (
        <EmptyPanel icon="calendar" title={`No free times on ${formatDateKey(date)}`}>
          <p>Try another date. Providers add times as their schedules open.</p>
        </EmptyPanel>
      ) : (
        <div className="grid gap-2">
          <SlotPicker
            legend={`Time on ${formatDateKey(date)} (India time, IST)`}
            slots={slots.data}
            value={values.slot}
            onChange={(slot) => set({ slot })}
            error={errors.slot}
          />
          <p className="text-[0.9375rem] text-[var(--ink-soft)]">
            Free times are a guide. Your request is not a booking until the provider accepts it.
          </p>
        </div>
      )}
      {date && slots.status !== "ready" && errors.slot ? (
        <p role="alert" className="text-sm font-medium text-[var(--warning)]">
          {errors.slot}
        </p>
      ) : null}
    </div>
  );
}

function DetailsStep({
  values,
  set,
  errors,
}: {
  values: Values;
  set: (patch: Partial<Values>) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="grid gap-6">
      <FormField label="House or flat, and street" required error={errors.line1}>
        <Input name="line1" autoComplete="street-address" value={values.line1} onChange={(e) => set({ line1: e.target.value })} />
      </FormField>
      <FormField label="Area or locality" required error={errors.locality}>
        <Input name="locality" autoComplete="address-level3" value={values.locality} onChange={(e) => set({ locality: e.target.value })} />
      </FormField>
      <p className="text-[0.9375rem] text-[var(--ink-soft)]">
        PIN code: <strong className="tabular-nums text-[var(--ink)]">{values.pin}</strong>
      </p>
      <FormField label="Name of the person to contact" required error={errors.contactName}>
        <Input name="contactName" autoComplete="name" value={values.contactName} onChange={(e) => set({ contactName: e.target.value })} />
      </FormField>
      <FormField label="Mobile number" required hint="10-digit Indian mobile number. Shared with the provider for this visit." error={errors.phone}>
        <Input name="phone" type="tel" inputMode="tel" autoComplete="tel" value={values.phone} onChange={(e) => set({ phone: e.target.value })} />
      </FormField>
      <div className="grid gap-2">
        <label className="flex items-start gap-3 text-[0.9375rem]">
          <input
            type="checkbox"
            name="consent"
            checked={values.consent}
            onChange={(e) => set({ consent: e.target.checked })}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? "consent-error" : undefined}
            className="mt-1 size-[1.125rem] flex-none accent-[var(--forest)]"
          />
          <span>
            I agree that SureCure Visit keeps a patient record for me and shares this address and contact with the provider I
            choose, so they can respond to this request. Read the <Link href="/privacy">privacy notice (draft)</Link>.
          </span>
        </label>
        {errors.consent ? (
          <p id="consent-error" role="alert" className="text-sm font-medium text-[var(--warning)]">
            {errors.consent}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Review({
  values,
  row,
  heading,
  onChange,
  onBack,
  onSend,
  sending,
  error,
}: {
  values: Values;
  row: CatalogRow | null;
  heading: ReactNode;
  onChange: (step: number) => void;
  onBack: () => void;
  onSend: () => void;
  sending: boolean;
  error: string | null;
}) {
  const complete =
    Boolean(row) && STEP_SCHEMAS.every((schema) => schema.safeParse(values).success) && Boolean(toE164(values.phone));
  const rows = [
    { label: "Service type", value: categories.find((c) => c.slug === values.service)?.name ?? "Not chosen", step: 0 },
    { label: "PIN code", value: values.pin.trim() || "Not entered", step: 1 },
    { label: "Provider", value: row?.display_name ?? "Not chosen", step: 2 },
    { label: "Service", value: row?.service_title ?? "Not chosen", step: 2 },
    { label: "Time", value: values.slot ? formatSlot(values.slot) : "Not chosen", step: 2 },
    {
      label: "Price",
      value: row ? `${formatPaise(row.amount_paise)} ${UNIT_LABEL[row.unit] ?? ""}, set by the provider` : "Not chosen",
      step: 2,
    },
    { label: "Address", value: [values.line1.trim(), values.locality.trim(), values.pin.trim()].filter(Boolean).join(", "), step: 3 },
    { label: "Contact", value: `${values.contactName.trim()}, ${toE164(values.phone) ?? values.phone}`, step: 3 },
  ];
  return (
    <section aria-label="Review">
      {heading}
      <ReviewList rows={rows} onChange={onChange} />
      <div className="mt-8 space-y-3 text-[0.9375rem]">
        <h3 className="font-sans text-[1.0625rem] font-bold tracking-normal">What happens after this</h3>
        <p className="max-w-[38rem] text-[var(--ink-soft)]">
          The provider accepts or declines your request. The price is confirmed by our server when you send, from the
          provider&apos;s current listing. {PAYMENT_LABEL}.
        </p>
        {values.service === "scheduled-ambulance" ? (
          <p className="max-w-[38rem] font-medium text-[var(--warning)]">
            Scheduled ambulance is for planned journeys only. In an emergency in India, call{" "}
            <a href="tel:112" className="text-[var(--warning)]">
              112
            </a>
            .
          </p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-6 max-w-[38rem] rounded-md border border-[var(--warning)] bg-[var(--warning-surface)] p-4 text-[0.9375rem]">
          {error}
        </p>
      ) : null}
      <StepActions onBack={onBack}>
        <Button onClick={onSend} disabled={!complete} loading={sending}>
          Send request
        </Button>
      </StepActions>
    </section>
  );
}

function Confirmation({
  sent,
  row,
  slot,
  onAnother,
}: {
  sent: Sent;
  row: CatalogRow | null;
  slot: string | undefined;
  onAnother: () => void;
}) {
  const { booking } = sent;
  const start = booking?.start_at ?? slot;
  return (
    <section aria-labelledby="sent-title" className="max-w-[40rem]">
      <div role="status" className="flex items-start gap-4 rounded-md border border-[var(--forest)] bg-[var(--mist)] p-6">
        <span aria-hidden="true" className="grid size-11 flex-none place-items-center rounded-full bg-[var(--forest)] text-[var(--paper)]">
          <Icon name="check" className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="sent-title" className="font-sans text-[1.375rem] leading-snug font-bold tracking-normal">
            Request sent{row ? ` to ${row.display_name}` : ""}
          </h2>
          <p className="mt-1 text-[var(--ink-soft)]">
            {row?.service_title}
            {start ? `, ${formatSlot(start)}` : ""}
          </p>
        </div>
      </div>
      <dl className="m-0 mt-6 grid gap-x-6 gap-y-2 text-[0.9375rem] sm:grid-cols-[10rem_minmax(0,1fr)]">
        {booking ? (
          <>
            <dt className="font-semibold text-[var(--ink-soft)]">Reference</dt>
            <dd className="m-0 tabular-nums">{booking.public_ref}</dd>
          </>
        ) : null}
        <dt className="font-semibold text-[var(--ink-soft)]">Status</dt>
        <dd className="m-0">{STATE_LABEL[booking?.state ?? "requested"]}. Not confirmed until the provider accepts.</dd>
        {booking ? (
          <>
            <dt className="font-semibold text-[var(--ink-soft)]">Price</dt>
            <dd className="m-0">{formatPaise(booking.amount_paise)}, as recorded with your request</dd>
          </>
        ) : null}
        <dt className="font-semibold text-[var(--ink-soft)]">Payment</dt>
        <dd className="m-0">{PAYMENT_LABEL}</dd>
      </dl>
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/dashboard">Go to your visits</ButtonLink>
        <Button variant="secondary" onClick={onAnother}>
          Make another request
        </Button>
      </div>
    </section>
  );
}

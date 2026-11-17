"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { categories } from "@/app/categories/data";
import { ButtonLink } from "@/components/button-link";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { DEMO_USERS, formatInr, providerById, providersByKind } from "@/lib/demo/data";
import { ChoiceList } from "./choice-list";
import {
  KIND_FOR_SERVICE,
  PAYMENT_LABEL,
  STATUS_LABEL,
  allBookings,
  formatSlot,
  prefillFromParams,
  takenSlots,
  type ServiceType,
} from "./demo-model";
import { DEMO_PROVIDER_ID, DemoBadge } from "./demo-parts";
import { dispatchDemo, useDemoState } from "./demo-store";
import { Icon } from "./icons";
import { bookingAreaSchema, bookingChoiceSchema, bookingServiceSchema } from "./schemas";
import { SlotPicker } from "./slot-picker";
import { ReviewList, StepActions, Stepper } from "./stepper";
import { stepErrors, type StepDef } from "./steps";
import { focusFirstError, useFlow } from "./use-flow";

type Values = { service?: ServiceType; pin: string; locality: string; providerId?: string; serviceId?: string; slot?: string };

export const BOOKING_STEPS: readonly StepDef[] = [
  { id: "service", title: "Service" },
  { id: "area", title: "PIN and area" },
  { id: "provider", title: "Provider and time" },
  { id: "review", title: "Review" },
];

const DEMO_PATIENT = DEMO_USERS.find((u) => u.role === "patient")!;

const serviceChoices = categories.map((c) => ({
  value: c.slug as ServiceType,
  label: c.name,
  description: c.summary,
  note: c.slug === "scheduled-ambulance" ? "Planned journeys only. In an emergency in India, call 112." : undefined,
}));

/**
 * Patient booking request against SYNTHETIC demo providers. Everything stays in this browser tab:
 * "Send request" adds a demo request to local state (status "requested", payment not collected)
 * and shows a confirmation. Links from provider profiles prefill it via ?provider=&service=&slot=.
 */
export function BookingFlow() {
  const params = useSearchParams();
  const [prefill] = useState(() => prefillFromParams(params));
  const prefilled = Boolean(prefill.providerId);
  // A link from a provider profile has already answered step 1, so start on the area step.
  const flow = useFlow(BOOKING_STEPS.length, prefilled ? 1 : 0);
  const demo = useDemoState();
  const [values, setValues] = useState<Values>({ pin: "", locality: "", ...prefill });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sentId, setSentId] = useState<string | null>(null);
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));

  function submitStep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const schema = [bookingServiceSchema, bookingAreaSchema, bookingChoiceSchema][flow.step];
    const found = schema ? stepErrors(schema, values) : {};
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

  function send() {
    const check = bookingChoiceSchema.safeParse(values);
    if (!check.success || !values.providerId || !values.serviceId || !values.slot) return;
    const id = `demo-req-${Date.now().toString(36)}`;
    dispatchDemo({
      type: "createBooking",
      booking: {
        id,
        providerId: values.providerId,
        serviceId: values.serviceId,
        patientName: DEMO_PATIENT.name,
        startsAt: values.slot,
        status: "requested",
        paymentStatus: "not_collected",
      },
    });
    setSentId(id);
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

  if (sentId) {
    return (
      <Confirmation
        values={values}
        onAnother={() => {
          setSentId(null);
          setValues({ pin: values.pin, locality: values.locality });
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
            onChange={(service) =>
              // A different service type means a different provider list, so clear the later choices.
              set(service === values.service ? {} : { service, providerId: undefined, serviceId: undefined, slot: undefined })
            }
            error={errors.service}
          />
          <StepActions />
        </form>
      ) : null}

      {flow.step === 1 ? (
        <form noValidate onSubmit={submitStep} aria-label={title}>
          {heading("Where should the visit happen?")}
          <div className="grid gap-6">
            <FormField
              label="PIN code"
              required
              hint="In this demo the PIN code is not used to filter providers."
              error={errors.pin}
            >
              <Input
                name="pin"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={6}
                value={values.pin}
                onChange={(e) => set({ pin: e.target.value })}
                className="max-w-[12rem] tabular-nums"
              />
            </FormField>
            <FormField label="Area or locality" hint="Optional. Helps the provider understand the location." error={errors.locality}>
              <Input name="locality" autoComplete="address-level3" value={values.locality} onChange={(e) => set({ locality: e.target.value })} />
            </FormField>
          </div>
          <StepActions onBack={flow.back} />
        </form>
      ) : null}

      {flow.step === 2 ? (
        <form noValidate onSubmit={submitStep} aria-label={title}>
          {heading("Choose a provider and time")}
          <ProviderStep values={values} set={set} errors={errors} taken={takenSlots(allBookings(demo), values.providerId ?? "")} />
          <StepActions onBack={flow.back} />
        </form>
      ) : null}

      {flow.step === 3 ? <Review values={values} heading={heading("Check your request")} onChange={openStep} onBack={flow.back} onSend={send} /> : null}
    </div>
  );
}

function ProviderStep({
  values,
  set,
  errors,
  taken,
}: {
  values: Values;
  set: (patch: Partial<Values>) => void;
  errors: Record<string, string>;
  taken: ReadonlySet<string>;
}) {
  const kind = values.service ? KIND_FOR_SERVICE[values.service] : null;
  const providers = kind ? providersByKind(kind) : [];
  const provider = providerById(values.providerId ?? "");

  if (providers.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-[var(--line-strong)] p-5 text-[var(--ink-soft)]">
        There are no demo providers for this service yet. Go back and choose another service to try the flow.
      </p>
    );
  }

  return (
    <div className="grid gap-8">
      <DemoBadge className="justify-self-start" />
      <ChoiceList
        legend="Provider"
        name="providerId"
        choices={providers.map((p) => ({
          value: p.id,
          label: p.name,
          description: `${p.speciality} · ${p.city} · ${p.languages.join(", ")}`,
        }))}
        value={values.providerId}
        onChange={(providerId) =>
          set(providerId === values.providerId ? {} : { providerId, serviceId: undefined, slot: undefined })
        }
        error={errors.providerId}
      />
      {provider ? (
        <>
          <ChoiceList
            legend="Service"
            name="serviceId"
            choices={provider.services.map((s) => ({
              value: s.id,
              label: s.name,
              description: `${formatInr(s.pricePaise)} demo price · about ${s.durationMin} minutes`,
            }))}
            value={values.serviceId}
            onChange={(serviceId) => set({ serviceId })}
            error={errors.serviceId}
          />
          <SlotPicker
            slots={provider.slots}
            taken={taken}
            value={values.slot}
            onChange={(slot) => set({ slot })}
            error={errors.slot}
          />
        </>
      ) : null}
    </div>
  );
}

function summaryRows(values: Values) {
  const provider = providerById(values.providerId ?? "");
  const service = provider?.services.find((s) => s.id === values.serviceId);
  return {
    provider,
    service,
    rows: [
      { label: "Service type", value: categories.find((c) => c.slug === values.service)?.name ?? "Not chosen", step: 0 },
      { label: "PIN code", value: values.pin.trim() || "Not entered", step: 1 },
      { label: "Area", value: values.locality.trim() || "Not given", step: 1 },
      { label: "Provider", value: provider?.name ?? "Not chosen", step: 2 },
      { label: "Service", value: service?.name ?? "Not chosen", step: 2 },
      { label: "Time", value: values.slot ? formatSlot(values.slot) : "Not chosen", step: 2 },
      { label: "Price", value: service ? `${formatInr(service.pricePaise)} (demo price)` : "Not chosen", step: 2 },
    ],
  };
}

function Review({
  values,
  heading,
  onChange,
  onBack,
  onSend,
}: {
  values: Values;
  heading: ReactNode;
  onChange: (step: number) => void;
  onBack: () => void;
  onSend: () => void;
}) {
  const { rows } = summaryRows(values);
  const complete = bookingChoiceSchema.safeParse(values).success;
  return (
    <section aria-label="Review">
      {heading}
      <DemoBadge className="mb-5" />
      <ReviewList rows={rows} onChange={onChange} />
      <div className="mt-8 space-y-3 text-[0.9375rem]">
        <h3 className="font-sans text-[1.0625rem] font-bold tracking-normal">What happens after this</h3>
        <p className="max-w-[38rem] text-[var(--ink-soft)]">
          The provider accepts or declines your request. {PAYMENT_LABEL}: nothing is charged in this demo.
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
      <StepActions onBack={onBack}>
        <Button onClick={onSend} disabled={!complete}>
          Send demo request
        </Button>
      </StepActions>
    </section>
  );
}

function Confirmation({ values, onAnother }: { values: Values; onAnother: () => void }) {
  const { provider, service } = summaryRows(values);
  return (
    <section aria-labelledby="sent-title" className="max-w-[40rem]">
      <div role="status" className="flex items-start gap-4 rounded-md border border-[var(--forest)] bg-[var(--mist)] p-6">
        <span aria-hidden="true" className="grid size-11 flex-none place-items-center rounded-full bg-[var(--forest)] text-[var(--paper)]">
          <Icon name="check" className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="sent-title" className="font-sans text-[1.375rem] leading-snug font-bold tracking-normal">
            Request sent to {provider?.name}
          </h2>
          <p className="mt-1 text-[var(--ink-soft)]">
            {service?.name}, {values.slot ? formatSlot(values.slot) : ""}
          </p>
        </div>
      </div>
      <dl className="m-0 mt-6 grid gap-x-6 gap-y-2 text-[0.9375rem] sm:grid-cols-[10rem_minmax(0,1fr)]">
        <dt className="font-semibold text-[var(--ink-soft)]">Status</dt>
        <dd className="m-0">{STATUS_LABEL.requested}. Not confirmed until the provider accepts.</dd>
        <dt className="font-semibold text-[var(--ink-soft)]">Payment</dt>
        <dd className="m-0">{PAYMENT_LABEL}</dd>
      </dl>
      <DemoBadge className="mt-6" />
      <p className="mt-3 text-[0.9375rem] text-[var(--ink-soft)]">
        This is a demo. Nothing was sent to a real provider.
        {values.providerId === DEMO_PROVIDER_ID ? (
          <>
            {" "}
            To see the other side, open the <Link href="/provider">provider screen</Link> and accept or decline it.
          </>
        ) : null}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/dashboard">Go to your visits</ButtonLink>
        <Button variant="secondary" onClick={onAnother}>
          Make another request
        </Button>
      </div>
    </section>
  );
}

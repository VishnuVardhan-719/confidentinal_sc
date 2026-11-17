"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { categories } from "@/app/categories/data";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ButtonLink } from "@/components/button-link";
import { ChoiceList } from "./choice-list";
import { DemoBadge } from "./demo-parts";
import { dispatchDemo } from "./demo-store";
import { Icon } from "./icons";
import {
  PROVIDER_STRUCTURES,
  SERVICE_TYPES,
  onboardingAreaSchema,
  onboardingDetailsSchema,
  onboardingTypeSchema,
  parsePinList,
} from "./schemas";
import { ReviewList, StepActions, Stepper } from "./stepper";
import { stepErrors, type StepDef } from "./steps";
import { focusFirstError, useFlow } from "./use-flow";

type Kind = (typeof SERVICE_TYPES)[number];
type Structure = (typeof PROVIDER_STRUCTURES)[number];
type Values = {
  kind?: Kind;
  structure?: Structure;
  name: string;
  registration: string;
  phone: string;
  email: string;
  pins: string;
};

export const ONBOARDING_STEPS: readonly StepDef[] = [
  { id: "type", title: "Provider type" },
  { id: "details", title: "Details" },
  { id: "area", title: "Service area" },
  { id: "documents", title: "Documents" },
  { id: "review", title: "Review" },
];

const kindChoices = categories.map((c) => ({ value: c.slug as Kind, label: c.name }));
const structureChoices = [
  { value: "individual" as const, label: "Individual", description: "You provide the service yourself." },
  { value: "organisation" as const, label: "Organisation", description: "A clinic, lab, agency or operator with staff." },
];

/**
 * Provider onboarding, UI only. Identity checks, document storage and admin verification (I02) are not
 * built, so uploads are switched off and the final submit is disabled. Nothing typed here leaves the page.
 */
export function OnboardingFlow() {
  const flow = useFlow(ONBOARDING_STEPS.length);
  const [values, setValues] = useState<Values>({ name: "", registration: "", phone: "", email: "", pins: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));

  function submitStep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const schema = [onboardingTypeSchema, onboardingDetailsSchema, onboardingAreaSchema][flow.step];
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

  function submitProfile() {
    // Re-check every step: the stepper lets people jump to Review after editing an earlier answer.
    const all = [onboardingTypeSchema, onboardingDetailsSchema, onboardingAreaSchema];
    const bad = all.findIndex((s) => !s.safeParse(values).success);
    if (bad >= 0) {
      openStep(bad);
      return;
    }
    dispatchDemo({
      type: "submitApplication",
      application: {
        id: `demo-app-${Date.now().toString(36)}`,
        name: `${values.name.trim()} (Demo)`,
        kind: values.kind!,
        submittedAt: new Date().toISOString(),
      },
    });
    setSubmitted(true);
  }

  const title = ONBOARDING_STEPS[flow.step]!.title;
  const heading = (text: string) => (
    <h2
      ref={flow.headingRef}
      tabIndex={-1}
      className="mb-6 font-sans text-[1.375rem] leading-snug font-bold tracking-normal outline-none"
    >
      {text}
    </h2>
  );
  const org = values.structure === "organisation";

  if (submitted) {
    return (
      <section aria-labelledby="profile-sent" className="max-w-[40rem]">
        <div role="status" className="flex items-start gap-4 rounded-md border border-[var(--forest)] bg-[var(--mist)] p-6">
          <span aria-hidden="true" className="grid size-11 flex-none place-items-center rounded-full bg-[var(--forest)] text-[var(--paper)]">
            <Icon name="check" className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id="profile-sent" className="font-sans text-[1.375rem] leading-snug font-bold tracking-normal">
              Profile submitted for review
            </h2>
            <p className="mt-1 text-[var(--ink-soft)]">You are not listed for patients until an admin approves your profile.</p>
          </div>
        </div>
        <DemoBadge className="mt-6" />
        <p className="mt-3 text-[0.9375rem] text-[var(--ink-soft)]">This is a demo. Nothing left this browser tab.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/admin">See it in the admin queue</ButtonLink>
          <ButtonLink href="/provider" variant="secondary">
            Back to requests
          </ButtonLink>
        </div>
      </section>
    );
  }

  return (
    <div className="max-w-[44rem]">
      <Stepper
        steps={ONBOARDING_STEPS}
        current={flow.step}
        furthest={flow.furthest}
        onOpen={openStep}
        label="Profile steps"
      />

      {flow.step === 0 ? (
        <form noValidate onSubmit={submitStep} aria-label={title}>
          {heading("What do you provide?")}
          <div className="grid gap-8">
            <ChoiceList
              legend="Service"
              name="kind"
              columns={2}
              choices={kindChoices}
              value={values.kind}
              onChange={(kind) => set({ kind })}
              error={errors.kind}
            />
            <ChoiceList
              legend="You are registering as"
              name="structure"
              columns={2}
              choices={structureChoices}
              value={values.structure}
              onChange={(structure) => set({ structure })}
              error={errors.structure}
            />
          </div>
          <StepActions />
        </form>
      ) : null}

      {flow.step === 1 ? (
        <form noValidate onSubmit={submitStep} aria-label={title}>
          {heading(org ? "About your organisation" : "About you")}
          <div className="grid gap-6">
            <FormField
              label={org ? "Organisation name" : "Full name"}
              required
              hint="As it should appear to patients."
              error={errors.name}
            >
              <Input
                name="name"
                autoComplete={org ? "organization" : "name"}
                value={values.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </FormField>
            <FormField
              label="Registration or licence number"
              required
              hint="As shown on your registration or licence document."
              error={errors.registration}
            >
              <Input
                name="registration"
                autoComplete="off"
                spellCheck={false}
                value={values.registration}
                onChange={(e) => set({ registration: e.target.value })}
              />
            </FormField>
            <div className="grid gap-6 sm:grid-cols-2">
              <FormField label="Mobile number" required hint="10 digits, for example 98765 43210." error={errors.phone}>
                <Input
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={values.phone}
                  onChange={(e) => set({ phone: e.target.value })}
                  className="tabular-nums"
                />
              </FormField>
              <FormField label="Email" required error={errors.email}>
                <Input
                  name="email"
                  type="email"
                  autoComplete="email"
                  spellCheck={false}
                  value={values.email}
                  onChange={(e) => set({ email: e.target.value })}
                />
              </FormField>
            </div>
          </div>
          <StepActions onBack={flow.back} />
        </form>
      ) : null}

      {flow.step === 2 ? (
        <form noValidate onSubmit={submitStep} aria-label={title}>
          {heading("Where do you provide the service?")}
          <FormField
            label="PIN codes you serve"
            required
            hint="Separate them with commas or spaces. Patients can only find you in areas you list here, after verification."
            error={errors.pins}
          >
            <Textarea
              name="pins"
              rows={3}
              inputMode="numeric"
              value={values.pins}
              onChange={(e) => set({ pins: e.target.value })}
              className="tabular-nums"
            />
          </FormField>
          <StepActions onBack={flow.back} />
        </form>
      ) : null}

      {flow.step === 3 ? (
        <form noValidate onSubmit={submitStep} aria-label={title}>
          {heading("Documents")}
          <p className="mb-6 max-w-[38rem] text-[0.9375rem] text-[var(--ink-soft)]">
            Admins check documents before a provider can be listed. The exact documents for each service will be
            confirmed before uploads open.
          </p>
          <DocumentSlot />
          <StepActions onBack={flow.back} />
        </form>
      ) : null}

      {flow.step === 4 ? (
        <Review values={values} heading={heading("Check your profile")} onChange={openStep} onBack={flow.back} onSubmit={submitProfile} />
      ) : null}
    </div>
  );
}

/** Upload placeholder. The file input is disabled so no file can be picked before private storage exists. */
function DocumentSlot() {
  return (
    <div className="rounded-md border border-dashed border-[var(--line-strong)] bg-[var(--paper-raised)] p-6">
      <div className="flex items-start gap-4">
        <span aria-hidden="true" className="grid size-11 flex-none place-items-center rounded-full bg-[var(--mist)] text-[var(--forest)]">
          <Icon name="upload" className="size-5" />
        </span>
        <div className="min-w-0">
          <label htmlFor="onboarding-document" className="font-semibold">
            Registration or licence document
          </label>
          <p id="upload-not-connected" className="mt-1 text-[0.9375rem] text-[var(--ink-soft)]">
            Uploads are not connected yet. Please do not send documents by email or chat in the meantime.
          </p>
          <input
            id="onboarding-document"
            type="file"
            disabled
            aria-describedby="upload-not-connected"
            className="mt-4 block w-full max-w-full cursor-not-allowed text-[0.9375rem] text-[var(--ink-soft)] file:mr-4 file:min-h-11 file:rounded-md file:border file:border-[var(--control-border)] file:bg-white file:px-4 file:font-semibold file:text-[var(--ink-soft)]"
          />
        </div>
      </div>
    </div>
  );
}

function Review({
  values,
  heading,
  onChange,
  onBack,
  onSubmit,
}: {
  values: Values;
  heading: ReactNode;
  onChange: (step: number) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const kind = categories.find((c) => c.slug === values.kind)?.name;
  const pins = parsePinList(values.pins);
  const rows = [
    { label: "Service", value: kind ?? "Not chosen", step: 0 },
    { label: "Registering as", value: structureChoices.find((s) => s.value === values.structure)?.label ?? "Not chosen", step: 0 },
    { label: "Name", value: values.name.trim() || "Not entered", step: 1 },
    { label: "Registration", value: values.registration.trim() || "Not entered", step: 1 },
    { label: "Mobile", value: values.phone.trim() || "Not entered", step: 1 },
    { label: "Email", value: values.email.trim() || "Not entered", step: 1 },
    { label: "PIN codes", value: pins.length ? pins.join(", ") : "None entered", step: 2 },
    { label: "Documents", value: "Not uploaded (uploads are not connected yet)", step: 3 },
  ];
  return (
    <section aria-label="Review">
      {heading}
      <DemoBadge className="mb-5" />
      <ReviewList rows={rows} onChange={onChange} />
      <p className="mt-8 max-w-[38rem] text-[0.9375rem] text-[var(--ink-soft)]">
        After you submit, an admin checks your details and documents. You are not listed for patients until that
        check is complete. In this demo, your profile joins the admin verification queue in this browser tab only.
      </p>
      <StepActions onBack={onBack}>
        <Button onClick={onSubmit}>Submit demo profile</Button>
      </StepActions>
    </section>
  );
}

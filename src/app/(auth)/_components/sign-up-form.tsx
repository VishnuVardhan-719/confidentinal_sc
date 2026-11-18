"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { FormEvent, ReactNode } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createDemoAccount } from "@/lib/demo/auth-actions";
import type { SignupRole } from "@/lib/validation/auth";
import {
  CONSULTATION_MODES,
  LAB_SERVICES,
  LANGUAGES,
  PREFERRED_LANGUAGES,
  SIGNUP_DETAIL_SCHEMAS,
  VEHICLE_TYPES,
} from "@/lib/validation/auth-signup";
import { ChoiceGroup, FieldSection, SubmitRow, focusFirstInvalid, useZodForm } from "./form-kit";

/** Order and wording for the role choice. Admin is deliberately absent: staff accounts are invite-only. */
export const roleOptions: ReadonlyArray<{ value: SignupRole; label: string; detail: string }> = [
  {
    value: "patient",
    label: "Patient or family member",
    detail: "Request doctor visits, lab services, scheduled ambulance transport or caretaker support.",
  },
  { value: "doctor", label: "Doctor", detail: "Offer planned consultations. You set your fees and accept requests yourself." },
  { value: "lab", label: "Lab", detail: "Offer diagnostic tests. You set your prices and choose which requests to accept." },
  {
    value: "ambulance",
    label: "Scheduled ambulance operator",
    detail: "Offer planned, non-emergency patient transport.",
  },
  { value: "caretaker", label: "Caretaker", detail: "Offer non-clinical help with day-to-day care at home." },
];

const languageOptions = LANGUAGES.map((l) => ({ value: l, label: l }));
const DESTINATION_LABEL: Record<SignupRole, string> = {
  patient: "your dashboard",
  doctor: "your provider profile",
  lab: "your provider profile",
  ambulance: "your provider profile",
  caretaker: "your caretaker page",
};

/** The parts of a useZodForm result that submit handling needs. */
type Form = {
  values: Record<string, unknown>;
  complete: boolean;
  errorCount: number;
  touchAll: () => void;
  setServerErrors: (errors: Record<string, string>) => void;
};

type Created = { name: string; home: string };

/**
 * Submit handling shared by every role form. Outside demo mode the button is disabled and nothing runs.
 * In demo mode the details go to a server action that re-validates them and starts a demo session.
 */
function useSignupSubmit(role: SignupRole, form: Form, demo: boolean, onCreated: (c: Created) => void) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | undefined>(undefined);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!demo) return;
    form.touchAll();
    if (!form.complete) {
      const n = form.errorCount;
      setStatus(`${n} ${n === 1 ? "field needs" : "fields need"} attention before the demo account can be created.`);
      focusFirstInvalid(ref.current);
      return;
    }
    setStatus("Creating your demo account…");
    startTransition(async () => {
      const result = await createDemoAccount({ ...form.values, role });
      if (result.ok) {
        onCreated({ name: result.name, home: result.home });
      } else {
        form.setServerErrors(result.fieldErrors);
        setStatus(result.error);
        focusFirstInvalid(ref.current);
      }
    });
  };

  return { ref, onSubmit, pending, status };
}

type DetailsProps = { demo: boolean; onCreated: (c: Created) => void };

function DetailsForm({
  role,
  form,
  demo,
  onCreated,
  children,
}: DetailsProps & { role: SignupRole; form: Form; children: ReactNode }) {
  const { ref, onSubmit, pending, status } = useSignupSubmit(role, form, demo, onCreated);
  const label = roleOptions.find((r) => r.value === role)?.label ?? role;
  return (
    <form
      ref={ref}
      noValidate
      onSubmit={onSubmit}
      aria-label={`${label} details`}
      className="flex flex-col gap-7"
    >
      {children}
      <SubmitRow
        label="Create account"
        action="Account creation"
        complete={form.complete}
        demo={demo}
        pending={pending}
        status={status}
      />
    </form>
  );
}

const mobile = { type: "tel", inputMode: "tel", autoComplete: "tel" } as const;
const MOBILE_HINT = "10-digit Indian mobile number.";

function PatientDetails(props: DetailsProps) {
  const form = useZodForm(SIGNUP_DETAIL_SCHEMAS.patient, {
    fullName: "", phone: "", email: "", dateOfBirth: "", city: "", preferredLanguage: "",
    emergencyContactName: "", emergencyContactPhone: "",
  });
  return (
    <DetailsForm role="patient" form={form} {...props}>
      <FieldSection title="About you">
        <FormField label="Full name" error={form.errorFor("fullName")} required>
          <Input autoComplete="name" autoCapitalize="words" {...form.bind("fullName")} />
        </FormField>
        <FormField label="Date of birth" error={form.errorFor("dateOfBirth")} required>
          <Input type="date" autoComplete="bday" className="sm:max-w-[14rem]" {...form.bind("dateOfBirth")} />
        </FormField>
        <FormField label="City" error={form.errorFor("city")} required>
          <Input autoComplete="address-level2" {...form.bind("city")} />
        </FormField>
        <FormField label="Preferred language" error={form.errorFor("preferredLanguage")} required>
          <Select placeholder="Choose a language" className="sm:max-w-[18rem]" {...form.bind("preferredLanguage")}>
            {PREFERRED_LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
        </FormField>
      </FieldSection>
      <FieldSection title="How to reach you">
        <FormField label="Mobile number" hint={MOBILE_HINT} error={form.errorFor("phone")} required>
          <Input {...mobile} {...form.bind("phone")} />
        </FormField>
        <FormField label="Email address" error={form.errorFor("email")} required>
          <Input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} {...form.bind("email")} />
        </FormField>
      </FieldSection>
      <FieldSection title="Emergency contact (optional)">
        <p className="-mt-3 text-sm text-[var(--ink-soft)]">
          You can add or change this later. In an emergency, call 112 first.
        </p>
        <FormField label="Contact's name" error={form.errorFor("emergencyContactName")}>
          <Input autoComplete="off" {...form.bind("emergencyContactName")} />
        </FormField>
        <FormField label="Contact's mobile number" hint={MOBILE_HINT} error={form.errorFor("emergencyContactPhone")}>
          <Input type="tel" inputMode="tel" autoComplete="off" {...form.bind("emergencyContactPhone")} />
        </FormField>
      </FieldSection>
    </DetailsForm>
  );
}

function DoctorDetails(props: DetailsProps) {
  const form = useZodForm(SIGNUP_DETAIL_SCHEMAS.doctor, {
    fullName: "", speciality: "", registrationNumber: "", yearsExperience: "", clinicCity: "",
    consultationModes: [] as string[], languages: [] as string[], feePaise: "",
  });
  return (
    <DetailsForm role="doctor" form={form} {...props}>
      <FieldSection title="About you">
        <FormField label="Full name" hint="As it appears on your registration." error={form.errorFor("fullName")} required>
          <Input autoComplete="name" autoCapitalize="words" {...form.bind("fullName")} />
        </FormField>
        <FormField label="Speciality" hint="For example, General Physician or Paediatrics." error={form.errorFor("speciality")} required>
          <Input autoComplete="off" {...form.bind("speciality")} />
        </FormField>
        <FormField
          label="Medical council registration number"
          hint="An admin checks this before anyone can book you."
          error={form.errorFor("registrationNumber")}
          required
        >
          <Input autoComplete="off" autoCapitalize="characters" spellCheck={false} {...form.bind("registrationNumber")} />
        </FormField>
        <FormField label="Years of experience" error={form.errorFor("yearsExperience")} required>
          <Input inputMode="numeric" autoComplete="off" className="sm:max-w-[10rem]" {...form.bind("yearsExperience")} />
        </FormField>
      </FieldSection>
      <FieldSection title="Your practice">
        <FormField label="Clinic city" error={form.errorFor("clinicCity")} required>
          <Input autoComplete="address-level2" {...form.bind("clinicCity")} />
        </FormField>
        <ChoiceGroup
          legend="Consultation modes"
          name="consultationModes"
          options={CONSULTATION_MODES}
          selected={form.values.consultationModes as string[]}
          onPick={(v) => form.toggle("consultationModes", v)}
          error={form.errorFor("consultationModes")}
          required
        />
        <ChoiceGroup
          legend="Languages you consult in"
          name="languages"
          options={languageOptions}
          selected={form.values.languages as string[]}
          onPick={(v) => form.toggle("languages", v)}
          error={form.errorFor("languages")}
          required
        />
        <FormField
          label="Consultation fee (₹)"
          hint="The fee you want to set, in rupees. Patients see it before they request a visit."
          error={form.errorFor("feePaise")}
          required
        >
          <Input inputMode="decimal" autoComplete="off" className="sm:max-w-[12rem]" {...form.bind("feePaise")} />
        </FormField>
      </FieldSection>
    </DetailsForm>
  );
}

function LabDetails(props: DetailsProps) {
  const form = useZodForm(SIGNUP_DETAIL_SCHEMAS.lab, {
    labName: "", licenceNumber: "", city: "", services: [] as string[], opensAt: "", closesAt: "",
    contactName: "", contactPhone: "",
  });
  return (
    <DetailsForm role="lab" form={form} {...props}>
      <FieldSection title="About the lab">
        <FormField label="Lab name" error={form.errorFor("labName")} required>
          <Input autoComplete="organization" {...form.bind("labName")} />
        </FormField>
        <FormField label="Licence number" hint="An admin checks this before anyone can book the lab." error={form.errorFor("licenceNumber")} required>
          <Input autoComplete="off" autoCapitalize="characters" spellCheck={false} {...form.bind("licenceNumber")} />
        </FormField>
        <FormField label="City" error={form.errorFor("city")} required>
          <Input autoComplete="address-level2" {...form.bind("city")} />
        </FormField>
        <ChoiceGroup
          legend="Services"
          name="services"
          options={LAB_SERVICES}
          selected={form.values.services as string[]}
          onPick={(v) => form.toggle("services", v)}
          error={form.errorFor("services")}
          required
        />
        <div className="grid grid-cols-2 gap-4 sm:max-w-[24rem]">
          <FormField label="Opens at" error={form.errorFor("opensAt")} required>
            <Input type="time" {...form.bind("opensAt")} />
          </FormField>
          <FormField label="Closes at" error={form.errorFor("closesAt")} required>
            <Input type="time" {...form.bind("closesAt")} />
          </FormField>
        </div>
      </FieldSection>
      <FieldSection title="Contact person">
        <FormField label="Name" error={form.errorFor("contactName")} required>
          <Input autoComplete="name" autoCapitalize="words" {...form.bind("contactName")} />
        </FormField>
        <FormField label="Mobile number" hint={MOBILE_HINT} error={form.errorFor("contactPhone")} required>
          <Input {...mobile} {...form.bind("contactPhone")} />
        </FormField>
      </FieldSection>
    </DetailsForm>
  );
}

function AmbulanceDetails(props: DetailsProps) {
  const form = useZodForm(SIGNUP_DETAIL_SCHEMAS.ambulance, {
    operatorName: "", registrationNumber: "", vehicleCount: "", baseCity: "", vehicleType: "",
    scheduledOnly: false as boolean, contactPhone: "",
  });
  const scheduledId = useId();
  const scheduledError = form.errorFor("scheduledOnly");
  return (
    <DetailsForm role="ambulance" form={form} {...props}>
      <div className="border-y border-[var(--ink)] py-4">
        <p className="font-semibold">Scheduled, non-emergency transfers only.</p>
        <p className="mt-1 text-[0.9375rem] text-[var(--ink-soft)]">
          SureCure Visit does not take emergency calls or dispatch ambulances. Patients book planned journeys ahead of
          time. In an emergency, people should call 112.
        </p>
      </div>
      <FieldSection title="About the operator">
        <FormField label="Operator name" error={form.errorFor("operatorName")} required>
          <Input autoComplete="organization" {...form.bind("operatorName")} />
        </FormField>
        <FormField label="Registration number" hint="An admin checks this before anyone can book you." error={form.errorFor("registrationNumber")} required>
          <Input autoComplete="off" autoCapitalize="characters" spellCheck={false} {...form.bind("registrationNumber")} />
        </FormField>
        <FormField label="Base city" error={form.errorFor("baseCity")} required>
          <Input autoComplete="address-level2" {...form.bind("baseCity")} />
        </FormField>
      </FieldSection>
      <FieldSection title="Fleet">
        <FormField label="Number of vehicles" error={form.errorFor("vehicleCount")} required>
          <Input inputMode="numeric" autoComplete="off" className="sm:max-w-[10rem]" {...form.bind("vehicleCount")} />
        </FormField>
        <FormField label="Vehicle type" hint="The main type you will offer. You can add others later." error={form.errorFor("vehicleType")} required>
          <Select placeholder="Choose a vehicle type" className="sm:max-w-[22rem]" {...form.bind("vehicleType")}>
            {VEHICLE_TYPES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Contact mobile number" hint={MOBILE_HINT} error={form.errorFor("contactPhone")} required>
          <Input {...mobile} {...form.bind("contactPhone")} />
        </FormField>
      </FieldSection>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={scheduledId} className="flex cursor-pointer items-start gap-3 text-[0.9375rem]">
          <input
            id={scheduledId}
            type="checkbox"
            name="scheduledOnly"
            checked={form.values.scheduledOnly as boolean}
            onChange={(e) => {
              form.setValue("scheduledOnly", e.target.checked);
              form.touch("scheduledOnly");
            }}
            aria-invalid={scheduledError ? true : undefined}
            aria-describedby={scheduledError ? `${scheduledId}-error` : undefined}
            className="mt-[0.2em] size-5 shrink-0 accent-[var(--forest)]"
          />
          <span>
            I will take <strong>scheduled, non-emergency transfers only</strong> through SureCure Visit.
            <span aria-hidden="true" className="ml-1 text-[var(--warning)]">
              *
            </span>
          </span>
        </label>
        {scheduledError ? (
          <p id={`${scheduledId}-error`} role="alert" className="pl-8 text-sm font-medium text-[var(--warning)]">
            {scheduledError}
          </p>
        ) : null}
      </div>
    </DetailsForm>
  );
}

function CaretakerDetails(props: DetailsProps) {
  const form = useZodForm(SIGNUP_DETAIL_SCHEMAS.caretaker, {
    fullName: "", phone: "", city: "", yearsExperience: "", languages: [] as string[], patientLinkCode: "",
  });
  return (
    <DetailsForm role="caretaker" form={form} {...props}>
      <FieldSection title="About you">
        <FormField label="Full name" error={form.errorFor("fullName")} required>
          <Input autoComplete="name" autoCapitalize="words" {...form.bind("fullName")} />
        </FormField>
        <FormField label="Mobile number" hint={MOBILE_HINT} error={form.errorFor("phone")} required>
          <Input {...mobile} {...form.bind("phone")} />
        </FormField>
        <FormField label="City" error={form.errorFor("city")} required>
          <Input autoComplete="address-level2" {...form.bind("city")} />
        </FormField>
        <FormField label="Years of experience" error={form.errorFor("yearsExperience")} required>
          <Input inputMode="numeric" autoComplete="off" className="sm:max-w-[10rem]" {...form.bind("yearsExperience")} />
        </FormField>
        <ChoiceGroup
          legend="Languages you speak"
          name="languages"
          options={languageOptions}
          selected={form.values.languages as string[]}
          onPick={(v) => form.toggle("languages", v)}
          error={form.errorFor("languages")}
          required
        />
      </FieldSection>
      <FieldSection title="Patient link (optional)">
        <FormField
          label="Patient link code"
          hint="If a family gave you a code, enter it to link to their account. You can add it later."
          error={form.errorFor("patientLinkCode")}
        >
          <Input autoComplete="off" autoCapitalize="characters" spellCheck={false} className="sm:max-w-[14rem]" {...form.bind("patientLinkCode")} />
        </FormField>
      </FieldSection>
    </DetailsForm>
  );
}

const DETAILS: Record<SignupRole, (p: DetailsProps) => ReactNode> = {
  patient: PatientDetails,
  doctor: DoctorDetails,
  lab: LabDetails,
  ambulance: AmbulanceDetails,
  caretaker: CaretakerDetails,
};

/** "Account created (demo)" confirmation, then a short pause before moving on so the message can be read. */
function CreatedNotice({ created, role }: { created: Created; role: SignupRole }) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
    const t = window.setTimeout(() => router.push(created.home), 1800);
    return () => window.clearTimeout(t);
  }, [created.home, router]);
  return (
    <section role="status" aria-live="polite" className="border-t-2 border-[var(--forest)] pt-6">
      <h2 ref={headingRef} tabIndex={-1} className="text-[clamp(1.625rem,2.6vw,2.125rem)] focus:outline-none">
        Account created (demo)
      </h2>
      <p className="mt-3 max-w-[34rem] text-[var(--ink-soft)]">
        Welcome, {created.name}. This demo account lives in this browser only. Taking you to {DESTINATION_LABEL[role]}…
      </p>
      <Link href={created.home} className="text-link mt-2">
        Continue now
      </Link>
    </section>
  );
}

export function SignUpForm({ initialRole = null, demo = false }: { initialRole?: SignupRole | null; demo?: boolean }) {
  const [role, setRole] = useState<SignupRole | null>(initialRole);
  const [created, setCreated] = useState<Created | null>(null);
  const hintId = useId();

  if (created && role) return <CreatedNotice created={created} role={role} />;

  const Details = role ? DETAILS[role] : null;
  return (
    <div className="flex flex-col gap-10">
      <fieldset className="m-0 border-0 p-0" aria-describedby={hintId} aria-required="true">
        <legend className="p-0 text-sm font-semibold">
          I am joining as
          <span aria-hidden="true" className="ml-1 text-[var(--warning)]">
            *
          </span>
        </legend>
        <p id={hintId} className="mt-1.5 text-sm text-[var(--ink-soft)]">
          Admin accounts cannot be chosen here. Each choice asks for its own details.
        </p>
        <div className="mt-3 border-t border-[var(--ink)]">
          {roleOptions.map((r) => (
            <label
              key={r.value}
              className={
                "grid cursor-pointer grid-cols-[1.25rem_1fr] gap-x-3.5 gap-y-0.5 border-b border-[var(--line)] px-2 py-3.5 " +
                "hover:bg-[var(--mist)] has-[:checked]:bg-[var(--mist)]"
              }
            >
              <input
                type="radio"
                name="role"
                value={r.value}
                checked={role === r.value}
                onChange={() => setRole(r.value)}
                className="row-span-2 mt-[0.2em] size-5 accent-[var(--forest)]"
              />
              <span className="font-semibold leading-snug">{r.label}</span>
              <span className="text-[0.9375rem] leading-normal text-[var(--ink-soft)]">{r.detail}</span>
            </label>
          ))}
        </div>
        {role && role !== "patient" ? (
          <p className="mt-3 text-[0.9375rem] text-[var(--ink-soft)]">
            After sign-up you will add your registration details for review. Nobody can book you until that review is
            complete.
          </p>
        ) : null}
      </fieldset>

      {Details && role ? (
        <div>
          <h2 className="mb-6 text-[clamp(1.5rem,2.4vw,1.875rem)]">
            {roleOptions.find((r) => r.value === role)?.label} details
          </h2>
          <Details key={role} demo={demo} onCreated={setCreated} />
        </div>
      ) : (
        <p className="text-[0.9375rem] text-[var(--ink-soft)]">Choose an account type to see the details it needs.</p>
      )}
    </div>
  );
}

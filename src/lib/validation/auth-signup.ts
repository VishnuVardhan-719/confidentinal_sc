import { z } from "zod";
import { emailSchema, indianMobileSchema, SIGNUP_ROLES, type SignupRole } from "./auth";

/*
 * Per-role sign-up details (phase 3). One schema per account type, joined by `role` so the server action
 * can re-validate exactly what the browser checked. Money is entered in rupees and stored as integer paise.
 */

export const LANGUAGES = ["English", "Telugu", "Hindi"] as const;
export const PREFERRED_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "te", label: "Telugu (తెలుగు)" },
  { value: "hi", label: "Hindi (हिन्दी)" },
] as const;
export const CONSULTATION_MODES = [
  { value: "video", label: "Video consultation" },
  { value: "clinic", label: "Clinic visit" },
] as const;
export const LAB_SERVICES = [
  { value: "home_collection", label: "Home sample collection" },
  { value: "lab_visit", label: "Lab visit" },
] as const;
export const VEHICLE_TYPES = [
  { value: "patient_transport", label: "Patient transport vehicle" },
  { value: "bls", label: "Basic life support (BLS)" },
  { value: "als", label: "Advanced life support (ALS)" },
] as const;

const values = <T extends readonly { value: string }[]>(list: T) => list.map((o) => o.value) as unknown as [T[number]["value"], ...T[number]["value"][]];

const text = (label: string, min = 2, max = 80) =>
  z
    .string()
    .trim()
    .min(1, `Enter ${label}`)
    .min(min, `${label[0].toUpperCase()}${label.slice(1)} is too short`)
    .max(max, `Use ${max} characters or fewer`);

const fullName = text("your full name");
const city = text("a city", 2, 60);

/** Registration and licence numbers: letters, digits, spaces, slash, hyphen and dot. Kept as typed, upper-cased. */
const registration = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label}`)
    .max(30, "Use 30 characters or fewer")
    .regex(/^[A-Za-z0-9][A-Za-z0-9 ./-]{2,}$/, `Use letters, numbers, spaces, / - or . for the ${label}`)
    .transform((v) => v.toUpperCase());

/** Whole numbers typed as text, so a cleared field reads as "" rather than NaN. */
const wholeNumber = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Enter ${label}`)
    .regex(/^\d+$/, "Use whole numbers only")
    .transform(Number)
    .pipe(z.number().int().min(min, `Must be at least ${min}`).max(max, `Must be ${max} or less`));

const yearsExperience = wholeNumber("years of experience", 0, 60);

const pickSome = <T extends [string, ...string[]]>(options: T, message: string) =>
  z.array(z.enum(options)).min(1, message).transform((list) => [...new Set(list)]);

const languages = pickSome([...LANGUAGES] as [string, ...string[]], "Choose at least one language");

export const FEE_RUPEES = { min: 1, max: 100000 } as const;

/**
 * Rupees as typed ("500", "1,200", "450.50") to integer paise, without floating-point maths.
 * Returns null when the text is not a valid amount.
 */
export function rupeesToPaise(input: string): number | null {
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(input.trim().replace(/,/g, ""));
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

const feePaise = z
  .string()
  .trim()
  .min(1, "Enter the fee you want to charge")
  .transform((v, ctx) => {
    const paise = rupeesToPaise(v);
    if (paise === null) {
      ctx.addIssue({ code: "custom", message: "Enter an amount in rupees, like 500 or 450.50" });
      return z.NEVER;
    }
    return paise;
  })
  .pipe(
    z
      .number()
      .int()
      .min(FEE_RUPEES.min * 100, `The fee must be at least ₹${FEE_RUPEES.min}`)
      .max(FEE_RUPEES.max * 100, `The fee must be ₹${FEE_RUPEES.max.toLocaleString("en-IN")} or less`),
  );

/** Calendar date "YYYY-MM-DD", real, not in the future, and within 120 years. `today` is injectable for tests. */
export const dateOfBirthSchema = (today: () => Date = () => new Date()) =>
  z
    .string()
    .min(1, "Enter your date of birth")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date as day, month and year")
    .refine((v) => {
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, "That date does not exist")
    .refine((v) => v <= today().toISOString().slice(0, 10), "Date of birth cannot be in the future")
    .refine((v) => Number(v.slice(0, 4)) >= today().getUTCFullYear() - 120, "Check the year");

const optionalMobile = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.union([z.literal(""), indianMobileSchema]))
  .transform((v) => (v === "" ? undefined : v));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer`)
    .transform((v) => (v === "" ? undefined : v));

const time = (label: string) => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, `Enter the ${label}`);

export const patientDetailsSchema = z
  .object({
    role: z.literal("patient"),
    fullName,
    phone: indianMobileSchema,
    email: emailSchema,
    dateOfBirth: dateOfBirthSchema(),
    city,
    preferredLanguage: z.enum(values(PREFERRED_LANGUAGES), { error: "Choose a language" }),
    emergencyContactName: optionalText(80),
    emergencyContactPhone: optionalMobile,
  })
  .superRefine((v, ctx) => {
    if (v.emergencyContactPhone && !v.emergencyContactName)
      ctx.addIssue({ code: "custom", path: ["emergencyContactName"], message: "Add a name for this emergency contact" });
    if (v.emergencyContactName && !v.emergencyContactPhone)
      ctx.addIssue({ code: "custom", path: ["emergencyContactPhone"], message: "Add a mobile number for this emergency contact" });
  });

export const doctorDetailsSchema = z.object({
  role: z.literal("doctor"),
  fullName,
  speciality: text("your speciality", 2, 60),
  registrationNumber: registration("medical council registration number"),
  yearsExperience,
  clinicCity: city,
  consultationModes: pickSome(values(CONSULTATION_MODES), "Choose at least one way to consult"),
  languages,
  feePaise,
});

export const labDetailsSchema = z
  .object({
    role: z.literal("lab"),
    labName: text("the lab's name"),
    licenceNumber: registration("licence number"),
    city,
    services: pickSome(values(LAB_SERVICES), "Choose at least one service"),
    opensAt: time("opening time"),
    closesAt: time("closing time"),
    contactName: text("a contact person's name"),
    contactPhone: indianMobileSchema,
  })
  .refine((v) => v.closesAt > v.opensAt, { path: ["closesAt"], message: "Closing time must be after opening time" });

export const ambulanceDetailsSchema = z.object({
  role: z.literal("ambulance"),
  operatorName: text("the operator's name"),
  registrationNumber: registration("registration number"),
  vehicleCount: wholeNumber("the number of vehicles", 1, 500),
  baseCity: city,
  vehicleType: z.enum(values(VEHICLE_TYPES), { error: "Choose a vehicle type" }),
  scheduledOnly: z.literal(true, { error: "Confirm that you will take scheduled, non-emergency transfers only" }),
  contactPhone: indianMobileSchema,
});

export const caretakerDetailsSchema = z.object({
  role: z.literal("caretaker"),
  fullName,
  phone: indianMobileSchema,
  city,
  yearsExperience,
  languages,
  patientLinkCode: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase().replace(/[\s-]/g, ""))
    .refine((v) => v === "" || /^[A-Z0-9]{6,12}$/.test(v), "A link code is 6 to 12 letters or numbers")
    .transform((v) => (v === "" ? undefined : v)),
});

export const signupDetailsSchema = z.discriminatedUnion("role", [
  patientDetailsSchema,
  doctorDetailsSchema,
  labDetailsSchema,
  ambulanceDetailsSchema,
  caretakerDetailsSchema,
]);

export type SignupDetails = z.infer<typeof signupDetailsSchema>;

export const SIGNUP_DETAIL_SCHEMAS = {
  patient: patientDetailsSchema,
  doctor: doctorDetailsSchema,
  lab: labDetailsSchema,
  ambulance: ambulanceDetailsSchema,
  caretaker: caretakerDetailsSchema,
} as const satisfies Record<SignupRole, z.ZodType>;

/** The name shown in the app after demo sign-up, whichever role it is. */
export function displayNameOf(d: SignupDetails): string {
  switch (d.role) {
    case "lab":
      return d.labName;
    case "ambulance":
      return d.operatorName;
    default:
      return d.fullName;
  }
}

export function cityOf(d: SignupDetails): string {
  switch (d.role) {
    case "doctor":
      return d.clinicCity;
    case "ambulance":
      return d.baseCity;
    default:
      return d.city;
  }
}

export function parseSignupRole(value: unknown): SignupRole | null {
  return typeof value === "string" && (SIGNUP_ROLES as readonly string[]).includes(value) ? (value as SignupRole) : null;
}

import { z } from "zod";

/**
 * Client-side form checks for the app shells. These only help people fix typing mistakes early.
 * Nothing is sent anywhere yet; when the backend lands, the server must validate again with its own schemas.
 */

export const SERVICE_TYPES = ["doctor", "lab", "scheduled-ambulance", "caretaker"] as const;
export const PROVIDER_STRUCTURES = ["individual", "organisation"] as const;

const pinCode = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]{5}$/, "Enter a 6-digit PIN code, for example 500001.");

/** Accepts 10-digit Indian mobile numbers with optional spaces, dashes or a +91 / 0 prefix. */
export function normaliseIndianMobile(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "").replace(/^(\+91|0)/, "");
  return /^[6-9][0-9]{9}$/.test(digits) ? digits : null;
}

const indianMobile = z
  .string()
  .trim()
  .refine((v) => normaliseIndianMobile(v) !== null, "Enter a 10-digit Indian mobile number.");

/** Splits a typed list of PIN codes on commas, spaces or new lines and removes duplicates. */
export function parsePinList(input: string): string[] {
  return [...new Set(input.split(/[\s,]+/).filter(Boolean))];
}

// Booking request (patient)
export const bookingServiceSchema = z.object({
  service: z.enum(SERVICE_TYPES, { error: "Choose the kind of care you need." }),
});

export const bookingAreaSchema = z.object({
  pin: pinCode,
  locality: z.string().trim().max(120, "Keep the area to 120 characters or fewer.").optional(),
});

export const bookingChoiceSchema = z.object({
  providerId: z.string({ error: "Choose a provider." }).min(1, "Choose a provider."),
  serviceId: z.string({ error: "Choose a service." }).min(1, "Choose a service."),
  slot: z.string({ error: "Choose a time." }).min(1, "Choose a time."),
});

// Provider onboarding
export const onboardingTypeSchema = z.object({
  kind: z.enum(SERVICE_TYPES, { error: "Choose the service you provide." }),
  structure: z.enum(PROVIDER_STRUCTURES, { error: "Choose individual or organisation." }),
});

export const onboardingDetailsSchema = z.object({
  name: z.string().trim().min(2, "Enter the name patients will see.").max(120, "Keep the name to 120 characters or fewer."),
  registration: z
    .string()
    .trim()
    .min(3, "Enter the registration or licence number.")
    .max(60, "Keep this to 60 characters or fewer."),
  phone: indianMobile,
  email: z.email("Enter an email address, for example name@example.com."),
});

export const onboardingAreaSchema = z.object({
  pins: z
    .string()
    .refine((v) => parsePinList(v).length > 0, "Enter at least one PIN code you serve.")
    .refine((v) => parsePinList(v).every((p) => /^[1-9][0-9]{5}$/.test(p)), "Each PIN code must have 6 digits.")
    .refine((v) => parsePinList(v).length <= 25, "Enter 25 PIN codes or fewer."),
});

// Account
export const accountSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(120, "Keep the name to 120 characters or fewer."),
  phone: indianMobile,
  email: z.email("Enter an email address, for example name@example.com."),
  language: z.enum(["en", "te", "hi"]),
});

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "te", label: "తెలుగు (Telugu)" },
  { code: "hi", label: "हिन्दी (Hindi)" },
] as const;

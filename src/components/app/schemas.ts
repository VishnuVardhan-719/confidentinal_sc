import { z } from "zod";
import { CATEGORY_SLUGS, PIN_RE } from "@/lib/client/booking";
import { checkIndianMobile, indianMobileSchema } from "@/lib/validation/auth";

/**
 * Client-side form checks for the app screens. They help people fix typing mistakes before anything is
 * sent; the API validates every field again with its own schemas (src/lib/validation/*).
 */

const pinCode = z.string().trim().regex(PIN_RE, "Enter a 6-digit PIN code, for example 500001.");

/** Accepts 10-digit Indian mobile numbers with optional spaces, dashes or a +91 / 0 prefix. Returns +91XXXXXXXXXX. */
export function toE164(input: string): string | null {
  const result = checkIndianMobile(input);
  return result.ok ? result.e164 : null;
}

export const bookingServiceSchema = z.object({
  service: z.enum(CATEGORY_SLUGS, { error: "Choose the kind of care you need." }),
});

export const bookingAreaSchema = z.object({ pin: pinCode });

export const bookingChoiceSchema = z.object({
  choice: z.string({ error: "Choose a provider and service." }).min(1, "Choose a provider and service."),
  date: z.iso.date({ error: "Choose a date." }),
  slot: z.string({ error: "Choose a time." }).min(1, "Choose a time."),
});

export const bookingDetailsSchema = z.object({
  line1: z.string().trim().min(1, "Enter the house or flat and street.").max(240, "Keep this to 240 characters or fewer."),
  locality: z.string().trim().min(1, "Enter the area or locality.").max(120, "Keep this to 120 characters or fewer."),
  contactName: z.string().trim().min(1, "Enter the name of the person to contact.").max(100, "Keep the name to 100 characters or fewer."),
  phone: indianMobileSchema,
  consent: z.literal(true, { error: "Tick the box to agree before you continue." }),
});

export const accountSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100, "Keep the name to 100 characters or fewer."),
  language: z.enum(["en", "te", "hi"]),
});

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "te", label: "తెలుగు (Telugu)" },
  { code: "hi", label: "हिन्दी (Hindi)" },
] as const;

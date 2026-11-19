import type { AppLocale } from "./routing";

/**
 * Message namespaces, one JSON file per namespace per locale in src/messages/<locale>/.
 * English is the source of truth for keys; te/hi must contain the same keys.
 */
export const NAMESPACES = [
  "common",
  "public",
  "auth",
  "onboarding",
  "patient",
  "doctor",
  "lab",
  "ambulance",
  "caretaker",
  "admin",
  "booking",
  "clinical",
  "payment",
  "support",
  "errors",
  "accessibility",
  "services",
] as const;

export type Namespace = (typeof NAMESPACES)[number];

/** Namespaces shipped to the browser via NextIntlClientProvider. Keep this small. */
export const CLIENT_NAMESPACES = ["common", "errors", "accessibility"] as const satisfies readonly Namespace[];

type Loader = () => Promise<{ default: Record<string, unknown> }>;

const loaders: Record<AppLocale, Record<Namespace, Loader>> = {
  en: {
    common: () => import("../messages/en/common.json"),
    public: () => import("../messages/en/public.json"),
    auth: () => import("../messages/en/auth.json"),
    onboarding: () => import("../messages/en/onboarding.json"),
    patient: () => import("../messages/en/patient.json"),
    doctor: () => import("../messages/en/doctor.json"),
    lab: () => import("../messages/en/lab.json"),
    ambulance: () => import("../messages/en/ambulance.json"),
    caretaker: () => import("../messages/en/caretaker.json"),
    admin: () => import("../messages/en/admin.json"),
    booking: () => import("../messages/en/booking.json"),
    clinical: () => import("../messages/en/clinical.json"),
    payment: () => import("../messages/en/payment.json"),
    support: () => import("../messages/en/support.json"),
    errors: () => import("../messages/en/errors.json"),
    accessibility: () => import("../messages/en/accessibility.json"),
    services: () => import("../messages/en/services.json"),
  },
  te: {
    common: () => import("../messages/te/common.json"),
    public: () => import("../messages/te/public.json"),
    auth: () => import("../messages/te/auth.json"),
    onboarding: () => import("../messages/te/onboarding.json"),
    patient: () => import("../messages/te/patient.json"),
    doctor: () => import("../messages/te/doctor.json"),
    lab: () => import("../messages/te/lab.json"),
    ambulance: () => import("../messages/te/ambulance.json"),
    caretaker: () => import("../messages/te/caretaker.json"),
    admin: () => import("../messages/te/admin.json"),
    booking: () => import("../messages/te/booking.json"),
    clinical: () => import("../messages/te/clinical.json"),
    payment: () => import("../messages/te/payment.json"),
    support: () => import("../messages/te/support.json"),
    errors: () => import("../messages/te/errors.json"),
    accessibility: () => import("../messages/te/accessibility.json"),
    services: () => import("../messages/te/services.json"),
  },
  hi: {
    common: () => import("../messages/hi/common.json"),
    public: () => import("../messages/hi/public.json"),
    auth: () => import("../messages/hi/auth.json"),
    onboarding: () => import("../messages/hi/onboarding.json"),
    patient: () => import("../messages/hi/patient.json"),
    doctor: () => import("../messages/hi/doctor.json"),
    lab: () => import("../messages/hi/lab.json"),
    ambulance: () => import("../messages/hi/ambulance.json"),
    caretaker: () => import("../messages/hi/caretaker.json"),
    admin: () => import("../messages/hi/admin.json"),
    booking: () => import("../messages/hi/booking.json"),
    clinical: () => import("../messages/hi/clinical.json"),
    payment: () => import("../messages/hi/payment.json"),
    support: () => import("../messages/hi/support.json"),
    errors: () => import("../messages/hi/errors.json"),
    accessibility: () => import("../messages/hi/accessibility.json"),
    services: () => import("../messages/hi/services.json"),
  },
};

export async function loadMessages(locale: AppLocale): Promise<Record<Namespace, Record<string, unknown>>> {
  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => [ns, (await loaders[locale][ns]()).default] as const),
  );
  return Object.fromEntries(entries) as Record<Namespace, Record<string, unknown>>;
}

export function pickNamespaces<T extends Record<string, unknown>, K extends keyof T>(
  messages: T,
  keys: readonly K[],
): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) out[key] = messages[key];
  return out;
}

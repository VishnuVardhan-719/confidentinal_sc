import type { DemoRole } from "./data";

/**
 * DEMO-ONLY test logins. Not real accounts: there is no backend, nothing is stored, and the shared
 * password below is public on purpose. Only usable while NEXT_PUBLIC_DEMO_MODE=true.
 */
export const DEMO_PASSWORD = "Demo@12345";

export type DemoAccount = { role: DemoRole; name: string; email: string; city?: string };

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { role: "patient", name: "Demo Patient One", email: "patient1@demo.invalid", city: "Hyderabad" },
  { role: "patient", name: "Demo Patient Two", email: "patient2@demo.invalid", city: "Vijayawada" },
  { role: "doctor", name: "Dr. Demo Asha (Demo)", email: "doctor1@demo.invalid", city: "Hyderabad" },
  { role: "doctor", name: "Dr. Demo Ravi (Demo)", email: "doctor2@demo.invalid", city: "Vijayawada" },
  { role: "lab", name: "Demo Diagnostics Lab (Demo)", email: "lab1@demo.invalid", city: "Hyderabad" },
  { role: "lab", name: "Demo Pathology Centre (Demo)", email: "lab2@demo.invalid", city: "Chennai" },
  { role: "ambulance", name: "Demo Patient Transport (Demo)", email: "ambulance1@demo.invalid", city: "Hyderabad" },
  { role: "ambulance", name: "Demo Transfer Service (Demo)", email: "ambulance2@demo.invalid", city: "Bengaluru" },
  { role: "caretaker", name: "Demo Caretaker One", email: "caretaker1@demo.invalid", city: "Hyderabad" },
  { role: "caretaker", name: "Demo Caretaker Two", email: "caretaker2@demo.invalid", city: "Bengaluru" },
  { role: "admin", name: "Demo Admin", email: "admin@demo.invalid" },
];

export function findDemoAccount(email: string, password: string): DemoAccount | null {
  if (password !== DEMO_PASSWORD) return null;
  const e = email.trim().toLowerCase();
  return DEMO_ACCOUNTS.find((a) => a.email === e) ?? null;
}

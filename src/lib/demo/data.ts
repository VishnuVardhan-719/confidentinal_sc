/**
 * SYNTHETIC DEMO DATA - for UI development and demos only.
 * Not real people, providers, prices or availability. Every screen that renders
 * this MUST show a visible "Demo data - not real" badge and read it only through
 * these exports so it can be swapped for the real API later.
 */
export const DEMO_LABEL = "Demo data — not real";

export type DemoRole = "patient" | "doctor" | "lab" | "ambulance" | "caretaker" | "admin";
export type DemoProvider = {
  id: string;
  kind: "doctor" | "lab" | "ambulance";
  name: string;
  speciality: string;
  city: string;
  languages: string[];
  experienceYears?: number;
  services: { id: string; name: string; pricePaise: number; durationMin: number }[];
  slots: string[]; // ISO UTC
};
const d = (day: number, h: number, m = 0) => new Date(Date.UTC(2026, 11, day, h, m)).toISOString();

export const DEMO_PROVIDERS: DemoProvider[] = [
  {
    id: "demo-dr-1", kind: "doctor", name: "Dr. Demo Asha (Demo)", speciality: "General Physician", city: "Hyderabad",
    languages: ["English", "Telugu", "Hindi"], experienceYears: 12,
    services: [
      { id: "s1", name: "Video consultation", pricePaise: 40000, durationMin: 20 },
      { id: "s2", name: "Clinic visit", pricePaise: 60000, durationMin: 30 },
    ],
    slots: [d(2, 4, 30), d(2, 5), d(3, 9), d(4, 10, 30)],
  },
  {
    id: "demo-dr-2", kind: "doctor", name: "Dr. Demo Ravi (Demo)", speciality: "Paediatrics", city: "Vijayawada",
    languages: ["English", "Telugu"], experienceYears: 8,
    services: [{ id: "s1", name: "Child health check", pricePaise: 50000, durationMin: 30 }],
    slots: [d(2, 6), d(3, 4), d(5, 8, 30)],
  },
  {
    id: "demo-dr-3", kind: "doctor", name: "Dr. Demo Meera (Demo)", speciality: "Dermatology", city: "Bengaluru",
    languages: ["English", "Hindi"], experienceYears: 15,
    services: [{ id: "s1", name: "Skin consultation", pricePaise: 75000, durationMin: 25 }],
    slots: [d(3, 7), d(4, 5, 30)],
  },
  {
    id: "demo-dr-4", kind: "doctor", name: "Dr. Demo Kiran (Demo)", speciality: "Cardiology", city: "Hyderabad",
    languages: ["English", "Telugu"], experienceYears: 18,
    services: [{ id: "s1", name: "Cardiac consultation", pricePaise: 120000, durationMin: 30 }],
    slots: [d(4, 9), d(6, 4, 30)],
  },
  {
    id: "demo-lab-1", kind: "lab", name: "Demo Diagnostics Lab (Demo)", speciality: "Home sample collection", city: "Hyderabad",
    languages: ["English", "Telugu"],
    services: [
      { id: "s1", name: "Basic health panel", pricePaise: 99900, durationMin: 15 },
      { id: "s2", name: "Thyroid profile", pricePaise: 45000, durationMin: 10 },
    ],
    slots: [d(2, 2, 30), d(3, 2, 30), d(4, 2, 30)],
  },
  {
    id: "demo-lab-2", kind: "lab", name: "Demo Pathology Centre (Demo)", speciality: "Lab visit", city: "Chennai",
    languages: ["English"],
    services: [{ id: "s1", name: "Diabetes screening", pricePaise: 35000, durationMin: 10 }],
    slots: [d(2, 3), d(5, 3)],
  },
  {
    id: "demo-amb-1", kind: "ambulance", name: "Demo Patient Transport (Demo)", speciality: "Scheduled ambulance (non-emergency)",
    city: "Hyderabad", languages: ["English", "Telugu", "Hindi"],
    services: [{ id: "s1", name: "Scheduled transfer (up to 15 km)", pricePaise: 150000, durationMin: 60 }],
    slots: [d(3, 5), d(4, 5), d(6, 5)],
  },
];

export type DemoBooking = {
  id: string;
  providerId: string;
  serviceId: string;
  patientName: string;
  startsAt: string;
  status: "requested" | "accepted" | "completed" | "cancelled" | "declined";
  paymentStatus: "not_collected";
};
export const DEMO_BOOKINGS: DemoBooking[] = [
  { id: "demo-b-1", providerId: "demo-dr-1", serviceId: "s1", patientName: "Demo Patient One", startsAt: d(2, 4, 30), status: "requested", paymentStatus: "not_collected" },
  { id: "demo-b-2", providerId: "demo-lab-1", serviceId: "s1", patientName: "Demo Patient One", startsAt: d(3, 2, 30), status: "accepted", paymentStatus: "not_collected" },
  { id: "demo-b-3", providerId: "demo-dr-3", serviceId: "s1", patientName: "Demo Patient Two", startsAt: d(1, 7), status: "completed", paymentStatus: "not_collected" },
  { id: "demo-b-4", providerId: "demo-amb-1", serviceId: "s1", patientName: "Demo Patient Two", startsAt: d(3, 5), status: "declined", paymentStatus: "not_collected" },
];
export const DEMO_PENDING_VERIFICATIONS = [
  { id: "demo-v-1", name: "Demo Clinic Applicant (Demo)", kind: "doctor", submittedAt: d(1, 6) },
  { id: "demo-v-2", name: "Demo Lab Applicant (Demo)", kind: "lab", submittedAt: d(1, 8) },
];
export const DEMO_USERS: { role: DemoRole; name: string; email: string }[] = [
  { role: "patient", name: "Demo Patient One", email: "patient@demo.invalid" },
  { role: "doctor", name: "Dr. Demo Asha (Demo)", email: "doctor@demo.invalid" },
  { role: "lab", name: "Demo Diagnostics Lab (Demo)", email: "lab@demo.invalid" },
  { role: "ambulance", name: "Demo Patient Transport (Demo)", email: "ambulance@demo.invalid" },
  { role: "caretaker", name: "Demo Caretaker", email: "caretaker@demo.invalid" },
  { role: "admin", name: "Demo Admin", email: "admin@demo.invalid" },
];
export const formatInr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;
export const providersByKind = (k: DemoProvider["kind"]) => DEMO_PROVIDERS.filter((p) => p.kind === k);
export const providerById = (id: string) => DEMO_PROVIDERS.find((p) => p.id === id);

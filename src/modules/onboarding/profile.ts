import type { PatientDraft, PinnedLocation } from "./patient";

/**
 * "Your profile at a glance" and the booking readiness check (USER-REQ-1 section D).
 *
 * The 13 required items (owner request "n of 13 complete"; email and photo are optional per
 * FRONTEND_MASTER s8 "email if approved/needed"):
 *   identity: 1 full name, 2 mobile number, 3 date of birth, 4 gender, 5 address
 *             (flat/street + city + state + PIN), 6 pinned location
 *   health:   7 blood group (or Unknown), 8 height, 9 weight, 10 allergies (or none/unknown),
 *             11 medical history, 12 current medicines, 13 previous surgeries
 * Health items are patient-reported and stay "unverified until a doctor confirms it in person".
 * Completeness is derived from saved values only; there is no stored percentage.
 */

export const PROFILE_ITEMS = [
  "fullName",
  "mobile",
  "dateOfBirth",
  "gender",
  "address",
  "location",
  "bloodGroup",
  "height",
  "weight",
  "allergies",
  "medicalHistory",
  "medicines",
  "surgeries",
] as const;
export type ProfileItemId = (typeof PROFILE_ITEMS)[number];
export const PROFILE_ITEM_TOTAL = PROFILE_ITEMS.length;

export type ProfileGroup = "identity" | "health";
export const PROFILE_ITEM_GROUP: Readonly<Record<ProfileItemId, ProfileGroup>> = {
  fullName: "identity",
  mobile: "identity",
  dateOfBirth: "identity",
  gender: "identity",
  address: "identity",
  location: "identity",
  bloodGroup: "health",
  height: "health",
  weight: "health",
  allergies: "health",
  medicalHistory: "health",
  medicines: "health",
  surgeries: "health",
};

/**
 * Where each item is edited on the health-profile form: `<section>.<field>`. The DOM id of the
 * field is `f-<section>-<field>` (see components/onboarding/form-spec fieldDomId).
 */
export const PROFILE_ITEM_FIELD: Readonly<Record<ProfileItemId, string>> = {
  fullName: "personal.fullName",
  mobile: "personal.contactPhone",
  dateOfBirth: "personal.birth",
  gender: "personal.gender",
  address: "personal.addressLine1",
  location: "personal.location",
  bloodGroup: "bloodGroup.state",
  height: "measurements.heightCm",
  weight: "measurements.weightKg",
  allergies: "allergies.state",
  medicalHistory: "medicalHistory.state",
  medicines: "medicines.state",
  surgeries: "surgeries.state",
};

export type AnswerSummary =
  | { state: "known"; items: string[] }
  | { state: "none" }
  | { state: "unknown" }
  | { state: "missing" };

/** Read-only view model for the profile page. Plain values; nothing here authorizes anything. */
export type PatientProfileView = {
  identity: {
    fullName: string | null;
    email: string | null;
    mobile: string | null;
    mobileVerified: boolean;
    dateOfBirth: string | null;
    /** Age in whole years on `now`, from the date of birth (or a stated age if that is all we have). */
    ageYears: number | null;
    gender: string | null;
    address: { line1: string; line2: string | null; landmark: string | null; city: string; state: string; pinCode: string } | null;
    location: PinnedLocation | null;
  };
  health: {
    bloodGroup: { state: "known"; value: string } | { state: "unknown" } | { state: "missing" };
    heightCm: number | null;
    weightKg: number | null;
    allergies: AnswerSummary;
    medicalHistory: AnswerSummary;
    medicines: AnswerSummary;
    surgeries: AnswerSummary;
    /** Always unverified in this release: self-reported until a doctor confirms in person. */
    verification: "unverified";
  };
};

export type ProfileCompleteness = {
  items: { id: ProfileItemId; group: ProfileGroup; complete: boolean; field: string }[];
  completed: number;
  total: number;
  missing: ProfileItemId[];
  readyToBook: boolean;
};

export function ageOnDate(dateOfBirth: string, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d)) age -= 1;
  return age >= 0 && age <= 150 ? age : null;
}

type ListedLike = { state: "known"; items: unknown[] } | { state: "none" } | { state: "unknown" } | undefined;

function answer(section: ListedLike, describe: (item: Record<string, unknown>) => string): AnswerSummary {
  if (!section) return { state: "missing" };
  if (section.state === "known") return { state: "known", items: section.items.map((i) => describe(i as Record<string, unknown>)).filter(Boolean) };
  return { state: section.state };
}

const text = (v: unknown): string => (typeof v === "string" ? v : "");

export function profileFromDraft(draft: PatientDraft, now: Date = new Date()): PatientProfileView {
  const s = draft.sections;
  const p = s.personal;
  const dob = p?.birth.kind === "dob" ? p.birth.dateOfBirth : null;
  const ageYears = dob ? ageOnDate(dob, now) : p?.birth.kind === "age" ? p.birth.years : null;
  return {
    identity: {
      fullName: p?.fullName ?? null,
      email: p?.email ?? null,
      mobile: p?.contactPhone ?? null,
      mobileVerified: s.account?.phoneVerified === true,
      dateOfBirth: dob,
      ageYears,
      gender: p?.gender ?? null,
      address: p
        ? { line1: p.addressLine1, line2: p.addressLine2 ?? null, landmark: p.landmark ?? null, city: p.city, state: p.state, pinCode: p.pinCode }
        : null,
      location: p?.location ?? null,
    },
    health: {
      bloodGroup: s.bloodGroup ? (s.bloodGroup.state === "known" ? { state: "known", value: s.bloodGroup.value } : { state: "unknown" }) : { state: "missing" },
      heightCm: s.measurements?.heightCm ?? null,
      weightKg: s.measurements?.weightKg ?? null,
      allergies: answer(s.allergies, (i) => [text(i.substance), text(i.reaction)].filter(Boolean).join(": ")),
      medicalHistory: answer(s.medicalHistory, (i) => [text(i.condition), typeof i.sinceYear === "number" ? String(i.sinceYear) : ""].filter(Boolean).join(", ")),
      medicines: answer(s.medicines, (i) => [text(i.name), text(i.dose), text(i.frequency)].filter(Boolean).join(", ")),
      surgeries: answer(s.surgeries, (i) => [text(i.procedure), typeof i.year === "number" ? String(i.year) : ""].filter(Boolean).join(", ")),
      verification: "unverified",
    },
  };
}

/** Derive the 13-item completeness from the view model. Date of birth (not a stated age) is required. */
export function profileCompleteness(view: PatientProfileView): ProfileCompleteness {
  const id = view.identity;
  const h = view.health;
  const done: Record<ProfileItemId, boolean> = {
    fullName: !!id.fullName?.trim(),
    mobile: !!id.mobile,
    dateOfBirth: !!id.dateOfBirth,
    gender: !!id.gender,
    address: !!id.address && !!id.address.line1 && !!id.address.city && !!id.address.state && !!id.address.pinCode,
    location: !!id.location,
    bloodGroup: h.bloodGroup.state !== "missing",
    height: h.heightCm !== null,
    weight: h.weightKg !== null,
    allergies: h.allergies.state !== "missing",
    medicalHistory: h.medicalHistory.state !== "missing",
    medicines: h.medicines.state !== "missing",
    surgeries: h.surgeries.state !== "missing",
  };
  const items = PROFILE_ITEMS.map((item) => ({ id: item, group: PROFILE_ITEM_GROUP[item], complete: done[item], field: PROFILE_ITEM_FIELD[item] }));
  const missing = items.filter((i) => !i.complete).map((i) => i.id);
  return { items, completed: items.length - missing.length, total: PROFILE_ITEM_TOTAL, missing, readyToBook: missing.length === 0 };
}

/** Sections the health-profile form saves, in order. Identity first, then the health record. */
export const PROFILE_FORM_SECTIONS = ["personal", "bloodGroup", "measurements", "allergies", "medicalHistory", "medicines", "surgeries"] as const;
export type ProfileFormSection = (typeof PROFILE_FORM_SECTIONS)[number];

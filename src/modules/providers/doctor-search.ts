import { z } from "zod";
import { fail, ok, type ApiResult } from "@/lib/api/result";
import { paiseSchema, pinSchema, utcSchema } from "@/modules/catalog/schemas";

/** Product taxonomy (labels are translated in booking.search.*). Not a claim about any provider. */
export const SPECIALITIES = ["general_physician", "internal_medicine", "paediatrics", "geriatrics", "physiotherapy", "dermatology",
  "gynaecology", "orthopaedics", "ent", "cardiology", "diabetology", "psychiatry"] as const;
export type Speciality = (typeof SPECIALITIES)[number];
/** Symptom -> speciality hints for search only. Needs clinical review before launch (REVIEW_NEEDED.md). */
export const SYMPTOMS = { fever: "general_physician", coughCold: "general_physician", childFever: "paediatrics", backPain: "orthopaedics",
  jointPain: "orthopaedics", skinRash: "dermatology", highSugar: "diabetology", bloodPressure: "cardiology", earPain: "ent",
  elderlyCare: "geriatrics", mobility: "physiotherapy", anxiety: "psychiatry" } as const satisfies Record<string, Speciality>;
export type Symptom = keyof typeof SYMPTOMS;
export const SYMPTOM_KEYS = Object.keys(SYMPTOMS) as Symptom[];
export const LANGUAGES = ["en", "te", "hi", "ur", "ta", "kn"] as const;
export const GENDERS = ["female", "male", "other"] as const;
export const CONSULT_MODES = ["home_visit", "clinic", "video"] as const;
export const AVAILABILITY = ["today", "tomorrow", "week"] as const;
export const DOCTOR_SORTS = ["availability", "nearest", "fee_asc"] as const;
export type DoctorSort = (typeof DOCTOR_SORTS)[number];

const citySchema = z.string().trim().min(2).max(60).regex(/^[\p{L}][\p{L} .'-]*$/u);
const querySchema = z.string().trim().min(1).max(80).regex(/^[\p{L}\p{N} .,'&()-]+$/u);
/** Only public, coarse search terms may enter the URL: never coordinates, patient names or free symptom text. */
export const doctorSearchSchema = z.strictObject({
  q: querySchema.optional(), city: citySchema.optional(), pin: pinSchema.optional(),
  speciality: z.enum(SPECIALITIES).optional(), symptom: z.enum(SYMPTOM_KEYS as [Symptom, ...Symptom[]]).optional(),
  language: z.enum(LANGUAGES).optional(), gender: z.enum(GENDERS).optional(), mode: z.enum(CONSULT_MODES).optional(),
  feeMax: paiseSchema.optional(), availability: z.enum(AVAILABILITY).optional(),
  experienceMin: z.number().int().min(1).max(60).optional(),
  sort: z.enum(DOCTOR_SORTS).default("availability"), showFull: z.boolean().default(false),
  page: z.number().int().min(1).max(50).default(1),
});
export type DoctorSearchInput = z.input<typeof doctorSearchSchema>;
export type DoctorSearch = z.output<typeof doctorSearchSchema>;
const URL_KEYS = ["q", "city", "pin", "speciality", "symptom", "language", "gender", "mode", "feeMax", "availability", "experienceMin", "sort", "showFull", "page"] as const;

export function readDoctorSearch(params: URLSearchParams): ApiResult<DoctorSearch> {
  const entries = Array.from(params.entries()).filter(([, value]) => value !== "");
  if (new Set(entries.map(([key]) => key)).size !== entries.length || entries.some(([key]) => !(URL_KEYS as readonly string[]).includes(key))) return fail("validation");
  const raw: Record<string, unknown> = Object.fromEntries(entries);
  for (const key of ["feeMax", "experienceMin", "page"] as const) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] !== "string" || !/^\d{1,11}$/.test(raw[key])) return fail("validation");
    raw[key] = Number(raw[key]);
  }
  if (raw.showFull !== undefined) { if (raw.showFull !== "1") return fail("validation"); raw.showFull = true; }
  const parsed = doctorSearchSchema.safeParse(raw);
  return parsed.success ? ok(parsed.data) : fail("validation");
}
export function doctorSearchParams(input: DoctorSearchInput): URLSearchParams {
  const value = doctorSearchSchema.parse(input);
  const params = new URLSearchParams();
  for (const key of URL_KEYS) {
    const item = value[key];
    if (item === undefined || (key === "sort" && item === "availability") || (key === "page" && item === 1) || (key === "showFull" && item === false)) continue;
    params.set(key, key === "showFull" ? "1" : String(item));
  }
  return params;
}

/** Explicitly confirmed device location. Travels only in a POST body, is never stored and never enters a URL. */
export const searchOriginSchema = z.strictObject({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracyM: z.number().min(0).max(100_000) });
export type SearchOrigin = z.infer<typeof searchOriginSchema>;

export const doctorResultSchema = z.object({
  providerId: z.uuid(), serviceId: z.uuid(), displayName: z.string().min(1).max(100),
  photoUrl: z.url({ protocol: /^https$/ }).nullable(),
  specialities: z.array(z.enum(SPECIALITIES)).max(4), degrees: z.array(z.string().min(1).max(20)).max(5),
  experienceYears: z.number().int().min(0).max(70).nullable(),
  languages: z.array(z.enum(LANGUAGES)).max(6), gender: z.enum(GENDERS).nullable(), modes: z.array(z.enum(CONSULT_MODES)).min(1),
  /** Only real, server-aggregated reviews. Null means none: render nothing, never a placeholder. */
  rating: z.object({ average: z.number().min(1).max(5), count: z.number().int().min(1) }).nullable(),
  feePaise: paiseSchema, unit: z.literal("visit"), openSlots: z.number().int().min(0).nullable(), nextSlotAt: utcSchema.nullable(),
  clinicName: z.string().min(1).max(100).nullable(),
  location: z.object({ locality: z.string().min(1).max(80), city: z.string().min(1).max(60), pin: pinSchema }).nullable(),
  /** Distance from the confirmed origin, only when both points are known. */
  distanceKm: z.number().min(0).nullable(),
  synthetic: z.boolean(),
});
export type DoctorResult = z.infer<typeof doctorResultSchema>;
export const doctorPageSchema = z.object({
  items: z.array(doctorResultSchema), total: z.number().int().min(0), page: z.number().int().min(1), hasMore: z.boolean(),
  origin: z.enum(["device", "none"]), synthetic: z.boolean(),
});
export type DoctorPage = z.infer<typeof doctorPageSchema>;

export const SUGGESTION_GROUPS = ["speciality", "symptom", "doctor", "clinic"] as const;
export const suggestionSchema = z.discriminatedUnion("group", [
  z.object({ group: z.literal("speciality"), value: z.enum(SPECIALITIES) }),
  z.object({ group: z.literal("symptom"), value: z.enum(SYMPTOM_KEYS as [Symptom, ...Symptom[]]) }),
  z.object({ group: z.literal("doctor"), providerId: z.uuid(), label: z.string().min(1).max(100), synthetic: z.boolean() }),
  z.object({ group: z.literal("clinic"), label: z.string().min(1).max(100), synthetic: z.boolean() }),
]);
export type Suggestion = z.infer<typeof suggestionSchema>;
export const suggestQuerySchema = z.string().trim().min(2).max(80);

/** Taxonomy matches are local and translated; provider names come from the adapter. */
export function taxonomySuggestions(query: string, labels: { speciality: (key: Speciality) => string; symptom: (key: Symptom) => string }): Suggestion[] {
  const needle = normalize(query);
  if (needle.length < 2) return [];
  const specialities = SPECIALITIES.filter(key => normalize(labels.speciality(key)).includes(needle) || key.includes(needle.replace(/ /g, "_")))
    .slice(0, 4).map(value => ({ group: "speciality" as const, value }));
  const symptoms = SYMPTOM_KEYS.filter(key => normalize(labels.symptom(key)).includes(needle)).slice(0, 4).map(value => ({ group: "symptom" as const, value }));
  return [...specialities, ...symptoms];
}
export function normalize(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (deg: number) => deg * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** "17.5294, 78.3946" with 4 decimals (about 11 m); accuracy rounded to whole metres. */
export function formatCoordinates(origin: SearchOrigin): { coordinates: string; accuracyM: number } {
  return { coordinates: origin.lat.toFixed(4) + ", " + origin.lng.toFixed(4), accuracyM: Math.round(origin.accuracyM) };
}

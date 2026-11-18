import { z } from "zod";
import { fixtureGuard, type FixtureEnvironment } from "@/lib/api/fixture";
import { getAdapterMode } from "@/lib/api/mode";
import { fail, ok, type ApiResult } from "@/lib/api/result";
import { SYNTHETIC_DOCTORS, type SyntheticDoctor } from "@/fixtures/marketplace/doctors";
import { doctorSearchSchema, haversineKm, normalize, searchOriginSchema, suggestQuerySchema, SYMPTOMS,
  type DoctorPage, type DoctorResult, type DoctorSearchInput, type SearchOrigin, type Suggestion } from "./doctor-search";

export const DOCTOR_PAGE_SIZE = 10;
export interface DoctorSearchApi {
  search(input: DoctorSearchInput, origin?: SearchOrigin): Promise<ApiResult<DoctorPage>>;
  /** Provider and clinic names only; taxonomy suggestions are computed locally. */
  suggest(query: string): Promise<ApiResult<{ items: Suggestion[] }>>;
  get(providerId: string): Promise<ApiResult<DoctorResult>>;
}

/** The inspected C01 catalog contract has no speciality, language, gender, mode, experience, slot,
 * rating or location fields and no text search (REQUESTS.md). Fail closed instead of guessing. */
export function createDoctorSearchHttpApi(): DoctorSearchApi {
  return {
    async search(input, origin) {
      return fail(doctorSearchSchema.safeParse(input).success && (origin === undefined || searchOriginSchema.safeParse(origin).success) ? "gated" : "validation");
    },
    async suggest(query) { return fail(suggestQuerySchema.safeParse(query).success ? "gated" : "validation"); },
    async get(id) { return fail(z.uuid().safeParse(id).success ? "gated" : "validation"); },
  };
}

const IST_OFFSET_MS = 330 * 60_000;
const istDay = (ms: number) => Math.floor((ms + IST_OFFSET_MS) / 86_400_000);

function materialize(row: SyntheticDoctor, nowMs: number, origin?: SearchOrigin): DoctorResult {
  const { point, nextSlotOffsetHours, ...rest } = row;
  return { ...structuredClone(rest),
    nextSlotAt: nextSlotOffsetHours === null ? null : new Date(Math.ceil((nowMs + nextSlotOffsetHours * 3_600_000) / 1_800_000) * 1_800_000).toISOString(),
    distanceKm: origin && point ? Math.round(haversineKm(origin, point) * 10) / 10 : null };
}

export function createDoctorSearchFixtureApi(options: { env?: FixtureEnvironment; now?: () => Date; scenario?: "available" | "empty" } = {}): DoctorSearchApi {
  const guard = fixtureGuard(options.env);
  const now = () => (options.now ?? (() => new Date()))().getTime();
  const rows = () => options.scenario === "empty" ? [] : SYNTHETIC_DOCTORS;
  return {
    async search(input, origin) {
      guard();
      const parsed = doctorSearchSchema.safeParse(input);
      const place = origin === undefined ? undefined : searchOriginSchema.safeParse(origin);
      if (!parsed.success || (place && !place.success)) return fail("validation");
      const search = parsed.data;
      const from = place?.success ? place.data : undefined;
      const nowMs = now();
      const today = istDay(nowMs);
      const speciality = search.speciality ?? (search.symptom ? SYMPTOMS[search.symptom] : undefined);
      const needle = search.q ? normalize(search.q) : undefined;
      let items = rows().map(row => materialize(row, nowMs, from)).filter(row =>
        (!needle || [row.displayName, row.clinicName ?? "", ...row.degrees].some(text => normalize(text).includes(needle)))
        && (!search.city || (row.location !== null && normalize(row.location.city) === normalize(search.city)) || row.location === null)
        && (!search.pin || row.location === null || row.location.pin === search.pin)
        && (!speciality || row.specialities.includes(speciality))
        && (!search.language || row.languages.includes(search.language))
        && (!search.gender || row.gender === search.gender)
        && (!search.mode || row.modes.includes(search.mode))
        && (search.feeMax === undefined || row.feePaise <= search.feeMax)
        && (search.experienceMin === undefined || (row.experienceYears ?? 0) >= search.experienceMin)
        && (search.showFull || row.openSlots !== 0)
        && (!search.availability || (row.nextSlotAt !== null && (() => {
          const day = istDay(Date.parse(row.nextSlotAt)) - today;
          return search.availability === "today" ? day === 0 : search.availability === "tomorrow" ? day === 1 : day >= 0 && day < 7;
        })())));
      const compare = (a: DoctorResult, b: DoctorResult) => {
        if (search.sort === "fee_asc") return a.feePaise - b.feePaise;
        if (search.sort === "nearest") return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
        return (b.openSlots ?? -1) - (a.openSlots ?? -1) || (a.nextSlotAt ?? "~").localeCompare(b.nextSlotAt ?? "~");
      };
      // Doctors without a location always go last, with a note in the UI.
      items = items.sort((a, b) => Number(a.location === null) - Number(b.location === null) || compare(a, b) || a.providerId.localeCompare(b.providerId));
      const start = (search.page - 1) * DOCTOR_PAGE_SIZE;
      return ok({ items: items.slice(start, start + DOCTOR_PAGE_SIZE), total: items.length, page: search.page,
        hasMore: start + DOCTOR_PAGE_SIZE < items.length, origin: from ? "device" : "none", synthetic: true });
    },
    async suggest(query) {
      guard();
      const parsed = suggestQuerySchema.safeParse(query);
      if (!parsed.success) return fail("validation");
      const needle = normalize(parsed.data);
      const doctors: Suggestion[] = rows().filter(row => normalize(row.displayName).includes(needle)).slice(0, 5)
        .map(row => ({ group: "doctor", providerId: row.providerId, label: row.displayName, synthetic: true }));
      const clinics: Suggestion[] = [...new Set(rows().map(row => row.clinicName).filter((name): name is string => !!name && normalize(name).includes(needle)))]
        .slice(0, 5).map(label => ({ group: "clinic", label, synthetic: true }));
      return ok({ items: [...doctors, ...clinics] });
    },
    async get(id) {
      guard();
      if (!z.uuid().safeParse(id).success) return fail("validation");
      const row = rows().find(item => item.providerId === id.toLowerCase());
      return row ? ok(materialize(row, now())) : fail("not_found");
    },
  };
}

export function createDoctorSearchApi(env?: FixtureEnvironment): DoctorSearchApi {
  return getAdapterMode(env) === "fixture" ? createDoctorSearchFixtureApi({ env }) : createDoctorSearchHttpApi();
}

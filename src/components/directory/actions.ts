"use server";

import { fail, type ApiResult } from "@/lib/api/result";
import { createDoctorSearchApi } from "@/modules/providers/doctor-api";
import { readDoctorSearch, searchOriginSchema, type DoctorPage, type Suggestion } from "@/modules/providers/doctor-search";

/** Public data only. Adapter mode is resolved here on the server, never in the browser. */
export async function suggestDoctorsAction(query: unknown): Promise<ApiResult<{ items: Suggestion[] }>> {
  if (typeof query !== "string") return fail("validation");
  try { return await createDoctorSearchApi().suggest(query); } catch { return fail("unavailable"); }
}

/** The confirmed device location arrives in the POST body only. It is not logged, stored or echoed into a URL. */
export async function searchDoctorsNearAction(search: unknown, origin: unknown): Promise<ApiResult<DoctorPage>> {
  if (typeof search !== "string" || search.length > 1000) return fail("validation");
  const parsed = readDoctorSearch(new URLSearchParams(search));
  if (!parsed.ok) return parsed;
  const place = searchOriginSchema.safeParse(origin);
  if (!place.success) return fail("validation");
  try { return await createDoctorSearchApi().search({ ...parsed.data, sort: "nearest" }, place.data); } catch { return fail("unavailable"); }
}

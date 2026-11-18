"use server";

import { fail, type ApiResult } from "@/lib/api/result";
import type { SuggestionGroup } from "@/components/shared/search-combobox-logic";

/**
 * Server action behind the landing hero's doctor search suggestions.
 *
 * Seam: the providers module with search/suggest (fe-c2, USER-REQ-1 B) is not on this branch and no
 * suggest endpoint is agreed yet (docs/frontend/REQUESTS.md R-FE01-7), so this returns `gated` and
 * the search box says suggestions are unavailable while Enter still searches.
 * On integration, call the providers module here and map its result to groups:
 *   specialities | symptoms | doctors | clinics  (labels localized server-side, hrefs locale-less).
 * Only published, verified providers may appear. Never log the query.
 */
export async function suggestDoctorSearch(query: string, locale: string): Promise<ApiResult<SuggestionGroup[]>> {
  void query;
  void locale;
  return fail("gated");
}

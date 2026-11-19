import { fail } from "@/lib/api/result";
import type { SavedProvidersApi } from "./api";

/** No saved-providers contract yet (docs/frontend/REQUESTS.md R-FE-P-R7-2). Fails closed; no network calls. */
export function createSavedProvidersHttpApi(): SavedProvidersApi {
  return {
    list: async () => fail("gated"),
    save: async () => fail("gated"),
    unsave: async () => fail("gated"),
  };
}

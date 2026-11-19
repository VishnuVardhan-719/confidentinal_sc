import type { ApiResult } from "@/lib/api/result";
import type { SavedProvider } from "./types";

/**
 * Saved doctors. Save and unsave are idempotent: saving an already-saved doctor and removing one
 * that is not saved both succeed, so double clicks and retries are safe.
 */
export type SavedProvidersApi = {
  list: () => Promise<ApiResult<SavedProvider[]>>;
  save: (providerId: string, idempotencyKey: string) => Promise<ApiResult<SavedProvider>>;
  unsave: (providerId: string) => Promise<ApiResult<{ providerId: string; saved: false }>>;
};

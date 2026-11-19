/** A doctor the patient bookmarked. Only the public provider id is stored; details come from the directory. */
export type SavedProvider = {
  providerId: string;
  savedAt: string;
};

/** Proposed cap per account (needs product confirmation, see REQUESTS.md R-FE-P-R7-2). */
export const MAX_SAVED_PROVIDERS = 50;

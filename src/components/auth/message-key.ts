import { API_ERROR_CODES } from "@/lib/api/result";

/**
 * Module flow states carry message keys such as "auth.errors.rateLimited", "errors.unavailable"
 * or "errors.fields.otp_invalid". This maps them onto keys that exist in the catalogues:
 * - "errors.<ApiErrorCode>"  -> "errors.api.<code>"            (shared errors namespace)
 * - "errors.fields.<code>"   -> "<fieldNamespace>.fieldErrors.<code>" (owned namespace)
 * Everything else is returned unchanged. Server text is never rendered.
 */
export type FieldNamespace = "auth" | "onboarding";

const API_CODES: ReadonlySet<string> = new Set(API_ERROR_CODES);

export function catalogKey(key: string, fieldNamespace: FieldNamespace): string {
  if (key.startsWith("errors.fields.")) {
    const code = key.slice("errors.fields.".length);
    return `${fieldNamespace}.fieldErrors.${/^[a-z_]{1,64}$/.test(code) ? code : "invalid"}`;
  }
  if (key.startsWith("errors.")) {
    const code = key.slice("errors.".length);
    return API_CODES.has(code) ? `errors.api.${code}` : "errors.api.generic";
  }
  return key;
}

/** Minimal translator shape shared by next-intl's server and client root translators. */
export type RootTranslator = {
  (key: never, values?: Record<string, string | number>): string;
  has: (key: never) => boolean;
};

/** Translate a module key, falling back to a known key when the catalogue has no entry. */
export function translateKey(
  t: RootTranslator,
  key: string,
  fieldNamespace: FieldNamespace,
  fallback: string,
  values?: Record<string, string | number>,
): string {
  const mapped = catalogKey(key, fieldNamespace);
  const k = (t.has(mapped as never) ? mapped : fallback) as never;
  return values ? t(k, values) : t(k);
}

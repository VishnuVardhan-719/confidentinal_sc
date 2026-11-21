import { formatPaise as formatCanonicalPaise, isValidPaise } from "@/lib/money";

export { isValidPaise };

/** Display money. Canonical formatter; the locale argument is accepted for call-site compatibility and ignored. */
export function formatPaise(paise: unknown, _locale?: string): string | null {
  return formatCanonicalPaise(paise);
}

/** Internal path or https URL with no credentials. Used before rendering any document link. */
export function isSafeDocumentHref(href: unknown): href is string {
  if (typeof href !== "string" || href.length === 0 || href.length > 2000) return false;
  if (/[\s<>"'`\\]/.test(href)) return false;
  if (href.startsWith("/")) return !href.startsWith("//");
  try {
    const url = new URL(href);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

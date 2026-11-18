/** Pure helpers for <SearchCombobox/> (unit-tested). */
export type Suggestion = {
  id: string;
  /** Already-localized display text. */
  label: string;
  description?: string;
  /** Locale-less internal path to open when chosen (e.g. "/doctors/abc"). Omit to just fill the input. */
  href?: string;
  /** Text placed in the input when chosen (defaults to label). */
  value?: string;
};

export type SuggestionGroup = {
  /** Stable group id, e.g. "specialities" | "symptoms" | "doctors" | "clinics". */
  id: string;
  label: string;
  items: Suggestion[];
};

export function flattenSuggestions(groups: readonly SuggestionGroup[]): Suggestion[] {
  return groups.flatMap((g) => g.items);
}

/** Move the active option with wrap-around; -1 means "no option active" (focus stays in the text). */
export function moveActive(current: number, delta: 1 | -1, length: number): number {
  if (length === 0) return -1;
  if (current === -1) return delta === 1 ? 0 : length - 1;
  return (current + delta + length) % length;
}

/** Query worth sending: trimmed, collapsed whitespace, at least `minChars` characters. */
export function normalizeQuery(raw: string, minChars = 2): string | null {
  const q = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  return Array.from(q).length >= minChars ? q.slice(0, 100) : null;
}

/** Only internal single-slash paths may be navigated to from a suggestion. */
export function isInternalSuggestionHref(href: unknown): href is string {
  return typeof href === "string" && href.startsWith("/") && !href.startsWith("//") && !/[\s\\]/.test(href);
}

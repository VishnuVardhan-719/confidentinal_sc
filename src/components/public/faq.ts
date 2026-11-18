/** FAQ catalogue: ids map to public.faqPage.items.<id>.{q,a}. Order within a category is display order. */
export const FAQ_CATEGORIES = {
  services: ["whatIs", "coverage", "emergency", "languages"],
  booking: ["browse", "confirmed", "questionnaire"],
  payments: ["price", "pay", "cancel"],
  account: ["privacy"],
  providers: ["verify", "join"],
} as const;

export type FaqCategory = keyof typeof FAQ_CATEGORIES;
export type FaqId = (typeof FAQ_CATEGORIES)[FaqCategory][number];

export const LANDING_FAQ: readonly FaqId[] = ["confirmed", "coverage", "price", "emergency", "verify"];

export type FaqEntry = { id: FaqId; category: FaqCategory; q: string; a: string };

/** Case- and whitespace-insensitive, Unicode-normalised (Telugu/Devanagari safe). */
export function normalizeForSearch(text: string): string {
  return text.normalize("NFC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

/** Every whitespace-separated term must appear in the question or answer. Empty query returns all. */
export function filterFaq<T extends Pick<FaqEntry, "q" | "a">>(entries: readonly T[], query: string): T[] {
  const terms = normalizeForSearch(query).split(" ").filter(Boolean);
  if (terms.length === 0) return [...entries];
  return entries.filter((e) => {
    const haystack = normalizeForSearch(`${e.q} ${e.a}`);
    return terms.every((t) => haystack.includes(t));
  });
}

import type { AnswerState } from "./patient";

/**
 * Editor models and input coercion for onboarding forms. Client islands keep string
 * inputs; these helpers convert them into the typed values the Zod section schemas
 * validate (again) on the server. No floating-point money: rupees are parsed as text.
 */

/** "1,250.50" / "₹ 800" -> paise. Null if not a valid non-negative rupee amount (max 2 decimals). */
export function rupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, "");
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const rupees = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const paise = rupees * 100 + fraction;
  return Number.isSafeInteger(paise) ? paise : null;
}

/** Paise -> editable rupee text ("800", "800.50"). */
export function paiseToRupeesInput(paise: number): string {
  if (!Number.isSafeInteger(paise) || paise < 0) return "";
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, "0")}`;
}

/** Whole number from a text input, or null. */
export function parseWholeNumber(input: string): number | null {
  const v = input.trim();
  if (!/^\d{1,9}$/.test(v)) return null;
  return Number(v);
}

/** Split a PIN list typed with commas, spaces or new lines. Validation happens in the schema. */
export const pinsFromText = (input: string): string[] => input.split(/[\s,;]+/).filter(Boolean);

/** Languages typed or chosen as codes; normalized lower-case, order kept. */
export const languagesFromText = (input: string): string[] =>
  input.split(/[\s,;]+/).filter(Boolean).map((l) => l.toLowerCase());

/* ---------------- Listed / None / Unknown editor ---------------- */

export type ListedEditor<T> = { state: AnswerState | null; items: T[] };

export type ListedValue<T> = { state: "known"; items: T[] } | { state: "none" } | { state: "unknown" };

/**
 * Editor -> section value. Choosing None or Unknown DISCARDS any typed details, so a
 * "None" answer can never carry stale entries. Returns null when no answer was chosen.
 */
export function listedValueFrom<T>(editor: ListedEditor<T>): ListedValue<T> | null {
  if (editor.state === null) return null;
  if (editor.state === "known") return { state: "known", items: editor.items };
  return { state: editor.state };
}

export function listedEditorFrom<T>(value: ListedValue<T> | undefined): ListedEditor<T> {
  if (!value) return { state: null, items: [] };
  return value.state === "known" ? { state: "known", items: value.items } : { state: value.state, items: [] };
}

/** Remove fully blank rows (all string fields empty) before validation. */
export function withoutBlankRows<T extends Record<string, unknown>>(items: T[]): T[] {
  return items.filter((item) =>
    Object.values(item).some((v) => (typeof v === "string" ? v.trim().length > 0 : v !== undefined && v !== null)),
  );
}

/** Empty optional strings become undefined so `optionalText` fields are omitted, not blank. */
export function compactOptional<T extends Record<string, unknown>>(item: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item)) {
    if (typeof v === "string" && v.trim() === "") continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out as T;
}

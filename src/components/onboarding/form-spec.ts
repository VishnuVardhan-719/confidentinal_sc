import {
  compactOptional,
  languagesFromText,
  paiseToRupeesInput,
  pinsFromText,
  rupeesToPaise,
} from "@/modules/onboarding/form-models";

/**
 * Declarative form specs for onboarding sections. The client keeps string-based form state;
 * `fromFormState` turns it into the typed value the module Zod schema validates (again on the
 * server). `toFormState` is the inverse, used to resume a server-saved draft. Pure and tested.
 *
 * Label keys are relative to the `onboarding` namespace.
 */

export type FormScalar = string | boolean | string[];
export type FormObject = { [key: string]: FormValue };
export type FormValue = FormScalar | FormObject | FormObject[];

type Base = { name: string; labelKey: string; hintKey?: string; optional?: boolean };

export type FieldSpec =
  | (Base & { kind: "text"; autoComplete?: string; inputMode?: "text" | "numeric" | "email" | "tel" })
  | (Base & { kind: "textarea" })
  | (Base & { kind: "int"; unitKey?: string })
  | (Base & { kind: "rupees" })
  | (Base & { kind: "phone" })
  | (Base & { kind: "date" })
  | (Base & { kind: "pinList" })
  | (Base & { kind: "langList" })
  | (Base & { kind: "select"; options: readonly string[]; optionSet: string })
  | (Base & { kind: "multi"; options: readonly string[]; optionSet: string })
  | (Base & { kind: "boolean" })
  /** Reference to a registered document of `documentKind` (picked from server evidence). */
  | (Base & { kind: "documentRef"; documentKind: string })
  /** Asset with no upload contract yet: rendered as an honest "not available" notice. */
  | (Base & { kind: "unavailableAsset" })
  | (Base & { kind: "hours" })
  | (Base & { kind: "group"; fields: readonly FieldSpec[] })
  | (Base & { kind: "list"; fields: readonly FieldSpec[]; addKey: string; max: number })
  | (Base & { kind: "const"; value: string | boolean })
  | (Base & { kind: "consent" })
  /** Date of birth OR age in years (personal step). */
  | (Base & { kind: "birth"; dobOnly?: boolean })
  /** Pinned location captured with explicit consent (device) or entered as a manual pin. */
  | (Base & { kind: "location" })
  /** Decimal number (e.g. weight in kg, one decimal). */
  | (Base & { kind: "decimal"; unitKey?: string });

/** Section-level specs. `answer` covers the Listed / None / Unknown questionnaire sections. */
export type SectionSpec =
  | { kind: "fields"; fields: readonly FieldSpec[] }
  | {
      kind: "answer";
      states: readonly ("known" | "none" | "unknown")[];
      /** Message key suffix per state, under `answers.<answerSet>.<state>`. */
      answerSet: string;
      known: { kind: "list"; name: string; fields: readonly FieldSpec[]; addKey: string; max: number } | { kind: "select"; name: string; options: readonly string[]; optionSet: string } | { kind: "unavailable" };
    }
  | { kind: "readonly" };

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export { WEEKDAYS };

/* ---------------- empty state ---------------- */

export function emptyField(f: FieldSpec): FormValue {
  switch (f.kind) {
    case "boolean":
    case "consent":
      return false;
    case "multi":
      return [];
    case "group":
      return emptyObject(f.fields);
    case "list":
      return f.optional ? [] : [emptyObject(f.fields)];
    case "hours":
      return [{ day: "mon", opens: "", closes: "" }];
    case "const":
      return f.value;
    case "birth":
      return { mode: "dob", dateOfBirth: "", years: "" };
    case "location":
      return { lat: "", lng: "", accuracyM: "", source: "", capturedAt: "" };
    default:
      return "";
  }
}

export const emptyObject = (fields: readonly FieldSpec[]): FormObject =>
  Object.fromEntries(fields.map((f) => [f.name, emptyField(f)]));

/* ---------------- form -> value ---------------- */

const str = (v: FormValue | undefined): string => (typeof v === "string" ? v : "");

function isBlank(v: FormValue | undefined): boolean {
  if (v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (typeof v === "boolean") return !v;
  if (Array.isArray(v)) return v.every((x) => (typeof x === "string" ? x.trim() === "" : isBlankObject(x)));
  return isBlankObject(v);
}
const isBlankObject = (o: FormObject): boolean => Object.values(o).every((v) => isBlank(v));

/** Fields whose blank value does not count as "the user typed something". */
const IGNORED_FOR_BLANK = new Set(["const", "boolean", "hours"]);

function rowIsBlank(fields: readonly FieldSpec[], row: FormObject): boolean {
  return fields.every((f) => IGNORED_FOR_BLANK.has(f.kind) || isBlank(row[f.name]));
}

function fieldFromForm(f: FieldSpec, v: FormValue | undefined): unknown {
  switch (f.kind) {
    case "text":
    case "textarea":
    case "date":
    case "select":
    case "documentRef": {
      const s = str(v).trim();
      return s === "" ? (f.optional || f.kind === "select" || f.kind === "documentRef" || f.kind === "date" ? undefined : "") : s;
    }
    case "unavailableAsset":
      return undefined;
    case "int": {
      const s = str(v).trim();
      if (s === "") return undefined;
      return /^-?\d{1,9}$/.test(s) ? Number(s) : s;
    }
    case "rupees": {
      const s = str(v).trim();
      if (s === "") return undefined;
      return rupeesToPaise(s) ?? s;
    }
    case "phone": {
      const digits = str(v).replace(/\D/g, "");
      return digits === "" ? undefined : `+91${digits}`;
    }
    case "pinList":
      return pinsFromText(str(v));
    case "langList":
      return languagesFromText(str(v));
    case "multi":
      return Array.isArray(v) ? (v as string[]).filter((x) => typeof x === "string") : [];
    case "boolean":
      return v === true;
    case "consent":
      return v === true;
    case "const":
      return f.value;
    case "birth": {
      const o = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as FormObject;
      if (str(o.mode) === "age") {
        const s = str(o.years).trim();
        return s === "" ? undefined : { kind: "age", years: /^\d{1,3}$/.test(s) ? Number(s) : s };
      }
      const d = str(o.dateOfBirth).trim();
      return d === "" ? undefined : { kind: "dob", dateOfBirth: d };
    }
    case "location": {
      const o = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as FormObject;
      const lat = Number(str(o.lat));
      const lng = Number(str(o.lng));
      if (str(o.lat) === "" || str(o.lng) === "" || !Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
      const accuracy = Number(str(o.accuracyM));
      return {
        lat,
        lng,
        accuracyM: Number.isFinite(accuracy) ? accuracy : 0,
        source: str(o.source) === "device" ? "device" : "manual_pin",
        capturedAt: str(o.capturedAt),
      };
    }
    case "decimal": {
      const s = str(v).trim().replace(",", ".");
      if (s === "") return undefined;
      return /^\d{1,4}(\.\d{1,2})?$/.test(s) ? Number(s) : s;
    }
    case "hours": {
      const rows = Array.isArray(v) ? (v as FormObject[]) : [];
      return rows
        .filter((r) => str(r.opens) !== "" || str(r.closes) !== "")
        .map((r) => ({ day: str(r.day), opens: str(r.opens), closes: str(r.closes) }));
    }
    case "group": {
      const o = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as FormObject;
      if (f.optional && rowIsBlank(f.fields, o)) return undefined;
      return objectFromForm(f.fields, o);
    }
    case "list": {
      const rows = Array.isArray(v) ? (v as FormObject[]) : [];
      return rows.filter((r) => !rowIsBlank(f.fields, r)).map((r) => objectFromForm(f.fields, r));
    }
  }
}

export function objectFromForm(fields: readonly FieldSpec[], state: FormObject): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const value = fieldFromForm(f, state[f.name]);
    if (value !== undefined) out[f.name] = value;
  }
  return compactOptional(out);
}

/* ---------------- value -> form ---------------- */

function fieldToForm(f: FieldSpec, value: unknown): FormValue {
  if (value === undefined || value === null) return emptyField(f);
  switch (f.kind) {
    case "int":
      return typeof value === "number" ? String(value) : "";
    case "rupees":
      return typeof value === "number" ? paiseToRupeesInput(value) : "";
    case "phone":
      return typeof value === "string" ? value.replace(/^\+91/, "") : "";
    case "pinList":
    case "langList":
      return Array.isArray(value) ? value.join(", ") : "";
    case "multi":
      return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
    case "boolean":
    case "consent":
      return value === true;
    case "const":
      return f.value;
    case "hours":
      return Array.isArray(value) && value.length > 0
        ? value.map((r) => ({ day: String((r as Record<string, unknown>).day ?? "mon"), opens: String((r as Record<string, unknown>).opens ?? ""), closes: String((r as Record<string, unknown>).closes ?? "") }))
        : emptyField(f);
    case "group":
      return objectToForm(f.fields, value as Record<string, unknown>);
    case "list":
      return Array.isArray(value) && value.length > 0 ? value.map((r) => objectToForm(f.fields, r as Record<string, unknown>)) : emptyField(f);
    case "unavailableAsset":
      return "";
    case "location": {
      const l = value as { lat?: number; lng?: number; accuracyM?: number; source?: string; capturedAt?: string };
      return {
        lat: typeof l.lat === "number" ? String(l.lat) : "",
        lng: typeof l.lng === "number" ? String(l.lng) : "",
        accuracyM: typeof l.accuracyM === "number" ? String(l.accuracyM) : "",
        source: l.source ?? "",
        capturedAt: l.capturedAt ?? "",
      };
    }
    case "decimal":
      return typeof value === "number" ? String(value) : "";
    case "birth": {
      const b = value as { kind?: string; dateOfBirth?: string; years?: number };
      return { mode: b.kind === "age" ? "age" : "dob", dateOfBirth: b.dateOfBirth ?? "", years: typeof b.years === "number" ? String(b.years) : "" };
    }
    default:
      return typeof value === "string" ? value : "";
  }
}

export function objectToForm(fields: readonly FieldSpec[], value: Record<string, unknown> | undefined): FormObject {
  const v = value ?? {};
  return Object.fromEntries(fields.map((f) => [f.name, fieldToForm(f, v[f.name])]));
}

/* ---------------- section level ---------------- */

export type SectionFormState =
  | { kind: "fields"; values: FormObject }
  | { kind: "answer"; state: string; items: FormObject[]; value: string }
  | { kind: "readonly" };

export function sectionToForm(spec: SectionSpec, value: unknown): SectionFormState {
  const v = (value ?? undefined) as Record<string, unknown> | undefined;
  switch (spec.kind) {
    case "fields":
      return { kind: "fields", values: objectToForm(spec.fields, v) };
    case "answer": {
      const state = typeof v?.state === "string" ? v.state : "";
      const known = spec.known;
      const items =
        known.kind === "list"
          ? Array.isArray(v?.[known.name]) && (v?.[known.name] as unknown[]).length > 0
            ? (v?.[known.name] as Record<string, unknown>[]).map((r) => objectToForm(known.fields, r))
            : [emptyObject(known.fields)]
          : [];
      const selected = known.kind === "select" && typeof v?.[known.name] === "string" ? (v[known.name] as string) : "";
      return { kind: "answer", state, items, value: selected };
    }
    case "readonly":
      return { kind: "readonly" };
  }
}

/**
 * Convert to the typed section value. Returns `null` when the section has no answer at all
 * (an unanswered Listed/None/Unknown question must not be saved as anything).
 * Choosing None/Unknown discards typed details.
 */
export function sectionFromForm(spec: SectionSpec, form: SectionFormState): unknown {
  if (spec.kind === "fields" && form.kind === "fields") return objectFromForm(spec.fields, form.values);
  if (spec.kind === "answer" && form.kind === "answer") {
    if (form.state === "") return null;
    if (form.state !== "known") return { state: form.state };
    const known = spec.known;
    if (known.kind === "list") {
      return { state: "known", [known.name]: form.items.filter((r) => !rowIsBlank(known.fields, r)).map((r) => objectFromForm(known.fields, r)) };
    }
    if (known.kind === "select") return form.value ? { state: "known", [known.name]: form.value } : { state: "known" };
    return { state: "known" };
  }
  return null;
}

/** DOM id for a field path such as "branches.0.pinCode" (used by ErrorSummary links). */
export const fieldDomId = (path: string): string => `f-${path.replace(/[^A-Za-z0-9]+/g, "-")}`;

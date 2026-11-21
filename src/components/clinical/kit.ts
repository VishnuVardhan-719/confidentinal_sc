import type { StatusDescriptor as BadgeDescriptor } from "@/components/shared/status";
import type { StatusDescriptor as ModuleDescriptor } from "@/modules/clinical/status-core";

/**
 * Translate a full "namespace.path" label key coming from a module status map.
 * Status maps are data, so their keys cannot be checked by next-intl's literal key types; a unit
 * test (tests/unit/modules-clinical/messages.test.ts) asserts every map key exists in en/te/hi.
 */
export type Tk = (key: string, values?: Record<string, string | number>) => string;

export function asTk(t: unknown): Tk {
  return t as Tk;
}

/**
 * Module tones -> fe2-a <StatusBadge/> tones. `progress` has no badge style in fe2-a (REQUESTS #28),
 * so it renders as `info` with a clock icon. Unknown values were already neutral in the module map.
 */
export function badgeFor(descriptor: ModuleDescriptor, tk: Tk): BadgeDescriptor {
  const label = tk(descriptor.labelKey);
  switch (descriptor.tone) {
    case "progress":
      return { tone: "info", label, icon: "clock" };
    case "neutral":
      return { tone: "neutral", label, icon: descriptor.labelKey === "clinical.status.unknown" ? "help" : "dot" };
    default:
      return { tone: descriptor.tone, label };
  }
}


/**
 * Parse a rupee amount typed by the doctor ("800", "800.5", "800.50") into integer paise without
 * floating-point arithmetic. Returns null for anything else (negative, >2 decimals, separators).
 */
export function parseRupeesToPaise(input: string): number | null {
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!m) return null;
  const paise = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return paise > 0 ? paise : null;
}

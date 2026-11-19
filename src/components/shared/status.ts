/**
 * Shared status vocabulary used by <StatusBadge/>.
 *
 * Each state machine keeps ONE canonical map in src/modules/<name>/status.ts that returns a
 * `StatusPresentation` ({ labelKey, tone }). Pages turn it into a badge with `toStatusDescriptor`
 * (or <KeyedStatusBadge/>), so an unknown server status or an unknown tone can never render as an
 * "active"/"approved"/"verified"-looking badge.
 *
 * Tone vocabulary (agreed across modules, XREVIEW-b X1):
 *   neutral  - inactive, closed, unknown
 *   info     - informational, waiting on someone else
 *   progress - work under way (en route, processing, in consultation)
 *   success  - completed or confirmed by the server
 *   warning  - needs attention (due, declined, disputed)
 *   danger   - failed, rejected, unsafe
 *   brand    - neutral emphasis in brand colour; NOT a verification signal
 */
export const STATUS_TONES = ["neutral", "info", "progress", "success", "warning", "danger", "brand"] as const;
export type StatusTone = (typeof STATUS_TONES)[number];

export const STATUS_ICONS = [
  "dot",
  "clock",
  "progress",
  "check",
  "x",
  "alert",
  "pause",
  "shield",
  "lock",
  "help",
] as const;
export type StatusIcon = (typeof STATUS_ICONS)[number];

export type StatusDescriptor = { tone: StatusTone; label: string; icon?: StatusIcon };

/** What module status maps return. `labelKey` is a full message key, e.g. "payment.status.due". */
export type StatusPresentation = { labelKey: string; tone: string; icon?: StatusIcon };

/**
 * Default icon per tone. `brand` deliberately defaults to a plain dot: the shield icon reads as
 * "verified" and must be opted into explicitly, only for states the server reports as verified.
 */
export const DEFAULT_ICON_FOR_TONE: Record<StatusTone, StatusIcon> = {
  neutral: "dot",
  info: "clock",
  progress: "progress",
  success: "check",
  warning: "alert",
  danger: "x",
  brand: "dot",
};

export function isStatusTone(value: unknown): value is StatusTone {
  return typeof value === "string" && (STATUS_TONES as readonly string[]).includes(value);
}

/** Look up a server status in a canonical map; anything unknown resolves to the neutral fallback. */
export function resolveStatus<S extends string>(
  map: Readonly<Record<S, StatusDescriptor>>,
  status: string | null | undefined,
  fallback: StatusDescriptor,
): StatusDescriptor {
  if (typeof status === "string" && Object.prototype.hasOwnProperty.call(map, status)) {
    return map[status as S];
  }
  return { ...fallback, tone: "neutral", icon: fallback.icon ?? "help" };
}

/** Minimal translator shape (next-intl's root `t` satisfies it). */
export type StatusTranslator = { (key: string): string; has(key: string): boolean };

export const UNKNOWN_STATUS_KEY = "common.status.unknown";

/**
 * Module presentation -> badge descriptor. Unknown tones become neutral; a label key with no message
 * falls back to the localized "Unknown status" instead of showing a raw key.
 */
export function toStatusDescriptor(presentation: StatusPresentation | null | undefined, t: StatusTranslator): StatusDescriptor {
  if (!presentation || !t.has(presentation.labelKey)) {
    return { tone: "neutral", label: t(UNKNOWN_STATUS_KEY), icon: "help" };
  }
  if (!isStatusTone(presentation.tone)) {
    // Unknown tone: fail closed and ignore any explicit icon (e.g. a "verified" shield).
    return { tone: "neutral", label: t(presentation.labelKey), icon: "help" };
  }
  return { tone: presentation.tone, label: t(presentation.labelKey), icon: presentation.icon };
}

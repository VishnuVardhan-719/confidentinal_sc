/**
 * Generic status descriptor used by <StatusBadge/>. Each state machine keeps its own canonical map in
 * src/modules/<name>/status.ts and resolves through `resolveStatus`, so an unknown server status
 * can never render as an "active"/"approved"-looking badge.
 */
export const STATUS_TONES = ["neutral", "info", "success", "warning", "danger", "brand"] as const;
export type StatusTone = (typeof STATUS_TONES)[number];

export const STATUS_ICONS = [
  "dot",
  "clock",
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

export const DEFAULT_ICON_FOR_TONE: Record<StatusTone, StatusIcon> = {
  neutral: "dot",
  info: "clock",
  success: "check",
  warning: "alert",
  danger: "x",
  brand: "shield",
};

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

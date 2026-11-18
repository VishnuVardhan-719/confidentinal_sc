/**
 * Shared shape for status maps in the doctor/clinical/records modules.
 * Label keys resolve through next-intl message namespaces; never render the raw status.
 */
export type StatusTone = "neutral" | "info" | "progress" | "success" | "warning" | "danger";

export type StatusDescriptor = { labelKey: string; tone: StatusTone };

/** Unknown server values never map to an active/approved/success look. */
export const UNKNOWN_STATUS: StatusDescriptor = { labelKey: "clinical.status.unknown", tone: "neutral" };

export function describeStatus<K extends string>(map: Readonly<Record<K, StatusDescriptor>>, value: string | null | undefined): StatusDescriptor {
  if (value == null) return UNKNOWN_STATUS;
  return Object.prototype.hasOwnProperty.call(map, value) ? map[value as K] : UNKNOWN_STATUS;
}

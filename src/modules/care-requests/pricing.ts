import type { RequestLine } from "@/modules/service-requests/core";
import type { CareProvider } from "./types";

/** Price lines for one care shift: the provider's hourly rate times the hours, in integer paise. */
export function careLines(provider: Pick<CareProvider, "hourlyRatePaise" | "minHours" | "maxHours">, hours: number): RequestLine[] | "validation" {
  if (!Number.isInteger(hours) || hours < provider.minHours || hours > provider.maxHours) return "validation";
  return [{ key: "hours", label: "Care hours", quantity: hours, unitPaise: provider.hourlyRatePaise, amountPaise: provider.hourlyRatePaise * hours }];
}

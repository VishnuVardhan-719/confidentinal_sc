/**
 * Uniform load state for data-driven shared components (NotificationList, TicketTimeline,
 * PaymentSummary ...). Pages map their module's ApiResult into this; components render every case.
 *
 *   loading -> skeleton            error -> localized InlineError + retry
 *   gated   -> GateNotice           ready -> the data (components handle "empty" themselves)
 */
import type { ApiResult } from "@/lib/api/result";
import type { FeatureFlag } from "@/lib/feature-flags";

export type ViewState<T> =
  | { kind: "loading" }
  | { kind: "error"; code?: string }
  | { kind: "gated"; feature?: FeatureFlag }
  | { kind: "ready"; data: T };

/** ApiResult -> ViewState. `gated` errors become the gated state; every other error stays an error. */
export function viewFromResult<T>(result: ApiResult<T>, feature?: FeatureFlag): ViewState<T> {
  if (result.ok) return { kind: "ready", data: result.data };
  if (result.error.code === "gated") return { kind: "gated", feature };
  return { kind: "error", code: result.error.code };
}

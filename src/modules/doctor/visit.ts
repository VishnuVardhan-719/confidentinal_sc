import type { AssignedVisitView, DoctorVisitLists, VisitPhase } from "./types";

export type VisitAction = "en_route" | "arrive" | "verify_arrival" | "start_consultation" | "open_consultation";

/**
 * Next permitted action derived from server state. The UI shows at most these; the server is
 * still the only authority and re-checks assignment and state on every command.
 */
export function allowedVisitActions(v: Pick<AssignedVisitView, "state" | "phase" | "consultationId">): VisitAction[] {
  if (v.state === "confirmed") {
    const byPhase: Partial<Record<VisitPhase, VisitAction[]>> = {
      scheduled: ["en_route"],
      en_route: ["arrive"],
      arrived: ["verify_arrival"],
      arrival_verified: ["start_consultation"],
    };
    return byPhase[v.phase] ?? [];
  }
  if (v.state === "in_progress" && v.phase === "service_started" && v.consultationId) return ["open_consultation"];
  return [];
}

const IST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
/** Calendar date (YYYY-MM-DD) in Asia/Kolkata for a UTC instant. */
export const istDate = (d: Date): string => IST_DATE.format(d);

const TERMINAL = new Set(["completed", "declined", "expired", "cancelled", "no_show", "interrupted"]);

/** Split assigned visits into today / upcoming by Asia/Kolkata calendar day, sorted by start. */
export function splitTodayUpcoming(visits: readonly AssignedVisitView[], now: Date): DoctorVisitLists {
  const today = istDate(now);
  const sorted = [...visits].filter((v) => !TERMINAL.has(v.state)).sort((a, b) => Date.parse(a.scheduledStartAt) - Date.parse(b.scheduledStartAt));
  return {
    today: sorted.filter((v) => istDate(new Date(v.scheduledStartAt)) === today),
    upcoming: sorted.filter((v) => istDate(new Date(v.scheduledStartAt)) > today),
  };
}

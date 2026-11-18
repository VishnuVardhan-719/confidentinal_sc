import type { ApiResult } from "@/lib/api/result";
import type { DoctorApi } from "./api";
import { deriveChallengeView, type ChallengeView } from "./otp";
import { parseRouteId, toPageState, type PageState } from "./routing";
import type { ArrivalChallenge, AssignedVisitView, DoctorRequestView, VersionResponse } from "./types";
import { allowedVisitActions, splitTodayUpcoming, type VisitAction } from "./visit";

/**
 * Server-side loaders for doctor pages. They take the module API as a parameter (pages pass
 * getDoctorApi()), call nothing else and return render-ready page states. Each dashboard
 * section fails independently so one outage does not blank the whole page.
 */

export type DoctorDashboardData = {
  requests: PageState<DoctorRequestView[]>;
  today: PageState<AssignedVisitView[]>;
  upcoming: PageState<AssignedVisitView[]>;
  /** The visit currently in consultation, if any (shown first). */
  active: AssignedVisitView | null;
};

const byRespondBy = (a: DoctorRequestView, b: DoctorRequestView) =>
  (a.respondBy ? Date.parse(a.respondBy) : Infinity) - (b.respondBy ? Date.parse(b.respondBy) : Infinity) ||
  Date.parse(a.scheduledStartAt) - Date.parse(b.scheduledStartAt);

export async function loadDoctorDashboard(api: DoctorApi, now: Date): Promise<DoctorDashboardData> {
  const [requests, visits] = await Promise.all([api.listRequests(), api.listVisits()]);
  const requestState = toPageState(requests.ok ? { ok: true as const, data: [...requests.data].sort(byRespondBy) } : requests, (d) => d.length === 0);
  if (!visits.ok) {
    const s = toPageState<AssignedVisitView[]>(visits);
    return { requests: requestState, today: s, upcoming: s, active: null };
  }
  const { today, upcoming } = splitTodayUpcoming(visits.data, now);
  const active = visits.data.find((v) => v.state === "in_progress" && v.phase === "service_started") ?? null;
  const asState = (list: AssignedVisitView[]): PageState<AssignedVisitView[]> => (list.length ? { kind: "ready", data: list } : { kind: "empty" });
  return { requests: requestState, today: asState(today), upcoming: asState(upcoming), active };
}

export async function loadRequests(api: DoctorApi): Promise<PageState<DoctorRequestView[]>> {
  const r = await api.listRequests();
  return toPageState(r.ok ? { ok: true as const, data: [...r.data].sort(byRespondBy) } : r, (d) => d.length === 0);
}

export async function loadVisits(api: DoctorApi, now: Date): Promise<PageState<{ today: AssignedVisitView[]; upcoming: AssignedVisitView[] }>> {
  const r = await api.listVisits();
  if (!r.ok) return toPageState(r);
  const split = splitTodayUpcoming(r.data, now);
  return split.today.length + split.upcoming.length === 0 ? { kind: "empty" } : { kind: "ready", data: split };
}

/** Time left to respond to a request, from the server timestamp only. */
export function requestRespondState(req: Pick<DoctorRequestView, "respondBy" | "state">, now: Date): { open: boolean; secondsLeft: number | null } {
  if (req.state !== "requested") return { open: false, secondsLeft: null };
  if (!req.respondBy) return { open: true, secondsLeft: null };
  const secondsLeft = Math.max(0, Math.floor((Date.parse(req.respondBy) - now.getTime()) / 1000));
  return { open: secondsLeft > 0, secondsLeft };
}

export type VisitDetailData = {
  visit: AssignedVisitView;
  actions: VisitAction[];
  /** Present only once arrival is reported; failures here do not fail the page. */
  challenge: PageState<{ challenge: ArrivalChallenge; view: ChallengeView }> | null;
};

export async function loadVisitDetail(api: DoctorApi, rawId: unknown, now: Date): Promise<PageState<VisitDetailData>> {
  const id = parseRouteId(rawId);
  if (!id) return { kind: "not_found" };
  const v = await api.getVisit(id);
  if (!v.ok) return toPageState(v);
  let challenge: VisitDetailData["challenge"] = null;
  if (v.data.state === "confirmed" && v.data.phase === "arrived") {
    const c = await api.getArrivalChallenge(id);
    challenge = toPageState(c.ok ? { ok: true as const, data: { challenge: c.data, view: deriveChallengeView(c.data, now) } } : c);
  }
  return { kind: "ready", data: { visit: v.data, actions: allowedVisitActions(v.data), challenge } };
}

// ---- Command outcome mapping ---------------------------------------------------------------
export type CommandOutcome =
  | { kind: "done"; version: number }
  /** Someone else changed it (another accept, slot taken, stale tab): refetch and explain. */
  | { kind: "refresh"; messageKey: string }
  | { kind: "denied"; messageKey: string }
  | { kind: "invalid"; messageKey: string }
  | { kind: "retry"; messageKey: string; retryAfterSeconds?: number }
  | { kind: "gated"; messageKey: string }
  | { kind: "signin"; messageKey: string };

/**
 * Map an accept/decline/en-route/arrive/start result to UI handling. Never assumes success:
 * on "retry" the UI refetches state before offering the action again.
 */
export function interpretCommand(result: ApiResult<VersionResponse>, action: "accept" | "decline" | "en_route" | "arrive" | "start"): CommandOutcome {
  if (result.ok) return { kind: "done", version: result.data.version };
  const k = `doctor.command.${action}`;
  switch (result.error.code) {
    case "conflict":
      return { kind: "refresh", messageKey: `${k}.conflict` };
    case "forbidden":
    case "not_found":
      return { kind: "denied", messageKey: "doctor.command.denied" };
    case "validation":
      return { kind: "invalid", messageKey: "doctor.command.invalid" };
    case "gated":
      return { kind: "gated", messageKey: "doctor.command.gated" };
    case "unauthenticated":
      return { kind: "signin", messageKey: "doctor.command.signin" };
    case "rate_limited":
      return { kind: "retry", messageKey: "doctor.command.rateLimited", retryAfterSeconds: result.error.retryAfterSeconds };
    case "unavailable":
      return { kind: "retry", messageKey: "doctor.command.unavailable" };
  }
}

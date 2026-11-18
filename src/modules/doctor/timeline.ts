import type { BookingState, VisitPhase } from "./types";

/**
 * Patient/doctor visit progress timeline (DC03).
 * Realtime events carry only minimal status (no names, notes, phone or OTP). Events are ordered
 * by server `version`; stale/duplicate events are discarded and a gap forces a refetch of the
 * authoritative booking state. If the transport is disconnected the UI shows "Last updated".
 */
export type VisitEvent = {
  eventId: string;
  bookingId: string;
  version: number;
  occurredAt: string;
  state: BookingState;
  phase: VisitPhase;
};

export type TimelineState = {
  bookingId: string;
  version: number;
  state: BookingState;
  phase: VisitPhase;
  events: VisitEvent[];
  /** Server time of the latest authoritative data. */
  lastUpdatedAt: string;
  connection: "live" | "disconnected";
  needsRefetch: boolean;
  /**
   * Highest version seen in any event, including ones discarded because of a gap.
   * A refetch is complete only once the timeline reaches this version.
   */
  observedVersion: number;
};

export type TimelineAction =
  | { type: "event"; event: VisitEvent }
  | { type: "disconnected" }
  | { type: "reconnected" }
  | { type: "snapshot"; version: number; state: BookingState; phase: VisitPhase; events: VisitEvent[]; fetchedAt: string };

export function timelineReducer(s: TimelineState, a: TimelineAction): TimelineState {
  switch (a.type) {
    case "event": {
      const e = a.event;
      if (e.bookingId !== s.bookingId) return s; // scoped: ignore other bookings
      if (e.version <= s.version) return s; // stale or duplicate
      const observedVersion = Math.max(s.observedVersion, e.version);
      if (e.version > s.version + 1) return { ...s, needsRefetch: true, observedVersion }; // gap: do not guess
      return { ...s, version: e.version, state: e.state, phase: e.phase, events: [...s.events, e], lastUpdatedAt: e.occurredAt, observedVersion };
    }
    case "disconnected":
      return { ...s, connection: "disconnected" };
    case "reconnected":
      // Never trust the socket alone after a reconnect.
      return { ...s, connection: "live", needsRefetch: true };
    case "snapshot": {
      // A snapshot older than what we already show is stale: ignore it and keep any pending recovery.
      if (a.version < s.version) return s;
      const observedVersion = Math.max(s.observedVersion, a.version);
      return {
        ...s,
        version: a.version,
        state: a.state,
        phase: a.phase,
        events: [...a.events].sort((x, y) => x.version - y.version),
        lastUpdatedAt: a.fetchedAt,
        observedVersion,
        // Still behind a version we saw announced (gap): keep refetching until we reach it.
        needsRefetch: a.version < s.observedVersion,
      };
    }
  }
}

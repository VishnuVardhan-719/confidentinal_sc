import type { AdapterMode } from "@/lib/api/mode";
import type { ApiResult } from "@/lib/api/result";
import type { EmergencyGuidance } from "./emergency";
import type {
  CrewMember,
  DriverQueueView,
  DriverTripView,
  FleetVehicle,
  Page,
  RequestDecisionInput,
  ScheduledTransportRequest,
  Trip,
  TripActionInput,
} from "./types";

export type TripQueue = "today" | "upcoming" | "exceptions";

/** Typed ambulance module API (scheduled transport only). */
export interface AmbulanceApi {
  readonly mode: AdapterMode;
  listFleet(): Promise<ApiResult<FleetVehicle[]>>;
  listCrew(): Promise<ApiResult<CrewMember[]>>;
  listRequests(input?: { cursor?: string }): Promise<ApiResult<Page<ScheduledTransportRequest>>>;
  getRequest(requestId: string): Promise<ApiResult<ScheduledTransportRequest>>;
  /**
   * Manual accept (with one assignable vehicle AND driver, fresh consistent quote) or decline with a
   * reason. Never automatic. http: owned by the bookings contract (POST /api/bookings/:id/accept|decline).
   */
  decideRequest(input: RequestDecisionInput): Promise<ApiResult<ScheduledTransportRequest>>;
  listTrips(input: { queue: TripQueue; cursor?: string }): Promise<ApiResult<Page<Trip>>>;
  getTrip(tripId: string): Promise<ApiResult<Trip>>;
  /** Driver: the single current assigned trip (or none) plus a count of later assignments. */
  getDriverQueue(): Promise<ApiResult<DriverQueueView>>;
  /** Only the current trip is readable; any other trip is not_found. */
  getDriverTrip(tripId: string): Promise<ApiResult<DriverTripView>>;
  performTripAction(input: TripActionInput): Promise<ApiResult<DriverTripView>>;
  /** Always unavailable; carries the call-108 guidance. Never an ETA. */
  getEmergencyGuidance(): EmergencyGuidance;
}

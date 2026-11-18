import type { AdapterMode } from "@/lib/api/mode";
import type { ApiResult } from "@/lib/api/result";
import type { EmergencyGuidance } from "./emergency";
import type {
  CrewMember,
  DriverTripView,
  FleetVehicle,
  Page,
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
  listTrips(input: { queue: TripQueue; cursor?: string }): Promise<ApiResult<Page<Trip>>>;
  getTrip(tripId: string): Promise<ApiResult<Trip>>;
  /** Driver: assigned, non-terminal trips only, minimal projection. */
  listDriverTrips(): Promise<ApiResult<DriverTripView[]>>;
  getDriverTrip(tripId: string): Promise<ApiResult<DriverTripView>>;
  performTripAction(input: TripActionInput): Promise<ApiResult<DriverTripView>>;
  /** Always unavailable; carries the call-112 guidance. Never an ETA. */
  getEmergencyGuidance(): EmergencyGuidance;
}

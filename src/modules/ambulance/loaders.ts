import { operationsNow } from "@/modules/admin/clock";
import { fail, ok } from "@/lib/api/result";
import { metricFrom, toLoaderResult, type LoaderResult, type WorkspaceLoaderContext } from "@/modules/admin/access";
import { belongsToWorkspace, toAmbulanceActor } from "@/modules/admin/workspace";
import type { TripQueue } from "./api";
import { getEmergencyGuidance, type EmergencyGuidance } from "./emergency";
import { getAmbulanceApi } from "./index";
import { driverAssignable, vehicleAssignable } from "./rules";
import {
  expiryWarnings,
  toCrewRow,
  toDriverTrip,
  toRequestRow,
  toTripRow,
  toVehicleRow,
  type AmbulanceDashboardVM,
  type CrewRowVM,
  type DriverQueueVM,
  type RequestRowVM,
  type TripRowVM,
  type VehicleRowVM,
} from "./view-models";

/** Server-side route loaders for the ambulance area (scheduled transport only). */

const clock = (ctx: WorkspaceLoaderContext) => (ctx.now ? ctx.now() : operationsNow(ctx.env));
const api = (ctx: WorkspaceLoaderContext) => getAmbulanceApi({ env: ctx.env, actor: toAmbulanceActor(ctx.workspace), now: ctx.now });

export async function loadAmbulanceDashboard(ctx: WorkspaceLoaderContext): Promise<LoaderResult<AmbulanceDashboardVM>> {
  const amb = api(ctx);
  const actor = toAmbulanceActor(ctx.workspace);
  const now = clock(ctx);
  const isOperator = actor.roles.includes("operator");
  const isDriver = actor.roles.includes("driver");
  const [requests, today, fleet, crew, driverTrips] = await Promise.all([
    isOperator ? amb.listRequests() : null,
    isOperator ? amb.listTrips({ queue: "today" }) : null,
    isOperator ? amb.listFleet() : null,
    isOperator ? amb.listCrew() : null,
    isDriver ? amb.getDriverQueue() : null,
  ]);
  const vm: AmbulanceDashboardVM = {
    roles: actor.roles,
    operator:
      isOperator && requests && today && fleet && crew
        ? {
            pendingRequests: metricFrom(requests, (items) => items.filter((r) => r.bookingState === "requested").length),
            todayTrips: metricFrom(today),
            assignableVehicles: metricFrom(fleet, (items) => items.filter((v) => vehicleAssignable(v, now)).length),
            assignableDrivers: metricFrom(crew, (items) => items.filter((c) => driverAssignable(c, now)).length),
            expiring: fleet.ok && crew.ok ? expiryWarnings(fleet.data, crew.data, now) : null,
          }
        : null,
    driver:
      isDriver && driverTrips
        ? {
            current: driverTrips.ok ? (driverTrips.data.current ? toDriverTrip(driverTrips.data.current) : null) : null,
            laterCount: driverTrips.ok
              ? { kind: "value", value: driverTrips.data.laterCount, lowerBound: false }
              : metricFrom(driverTrips),
          }
        : null,
  };
  return toLoaderResult(ok(vm), amb.mode);
}

export async function loadFleet(ctx: WorkspaceLoaderContext): Promise<LoaderResult<VehicleRowVM[]>> {
  const amb = api(ctx);
  const now = clock(ctx);
  const result = await amb.listFleet();
  return toLoaderResult(result.ok ? ok(result.data.map((v) => toVehicleRow(v, now))) : result, amb.mode, (rows) => rows.length === 0);
}

export async function loadCrew(ctx: WorkspaceLoaderContext): Promise<LoaderResult<CrewRowVM[]>> {
  const amb = api(ctx);
  const now = clock(ctx);
  const result = await amb.listCrew();
  return toLoaderResult(result.ok ? ok(result.data.map((c) => toCrewRow(c, now))) : result, amb.mode, (rows) => rows.length === 0);
}

/** Availability screen: assignable vs unavailable vehicles and drivers, from real records only. */
export async function loadAvailability(ctx: WorkspaceLoaderContext): Promise<LoaderResult<{ vehicles: VehicleRowVM[]; crew: CrewRowVM[] }>> {
  const amb = api(ctx);
  const now = clock(ctx);
  const [fleet, crew] = await Promise.all([amb.listFleet(), amb.listCrew()]);
  if (!fleet.ok) return toLoaderResult(fleet, amb.mode);
  if (!crew.ok) return toLoaderResult(crew, amb.mode);
  return toLoaderResult(
    ok({ vehicles: fleet.data.map((v) => toVehicleRow(v, now)), crew: crew.data.map((c) => toCrewRow(c, now)) }),
    amb.mode,
    (d) => d.vehicles.length === 0 && d.crew.length === 0,
  );
}

export type AssignOption = { resourceId: string; label: string };

/** Requests plus the vehicles/drivers that may be assigned now (accept form options). Unknown capacity = no options. */
export async function loadRequests(
  ctx: WorkspaceLoaderContext,
  cursor?: string,
): Promise<LoaderResult<{ rows: RequestRowVM[]; nextCursor: string | null; vehicles: AssignOption[]; drivers: AssignOption[] }>> {
  const amb = api(ctx);
  const now = clock(ctx);
  const [requests, fleet, crew] = await Promise.all([amb.listRequests(cursor ? { cursor } : undefined), amb.listFleet(), amb.listCrew()]);
  if (!requests.ok) return toLoaderResult(requests, amb.mode);
  if (!belongsToWorkspace(requests.data.items, ctx.workspace, (r) => r.providerId)) return toLoaderResult(fail("unavailable"), amb.mode);
  const rows = requests.data.items.map((r) => toRequestRow(r, fleet.ok ? fleet.data : null, crew.ok ? crew.data : null, now));
  const vehicles = fleet.ok ? fleet.data.filter((v) => vehicleAssignable(v, now)).map((v) => ({ resourceId: v.resourceId, label: v.label })) : [];
  const drivers = crew.ok ? crew.data.filter((d) => driverAssignable(d, now)).map((d) => ({ resourceId: d.resourceId, label: d.displayName })) : [];
  return toLoaderResult(ok({ rows, nextCursor: requests.data.nextCursor, vehicles, drivers }), amb.mode, (d) => d.rows.length === 0);
}

export async function loadTrips(ctx: WorkspaceLoaderContext, queue: TripQueue, cursor?: string): Promise<LoaderResult<{ rows: TripRowVM[]; nextCursor: string | null }>> {
  const amb = api(ctx);
  const result = await amb.listTrips({ queue, ...(cursor ? { cursor } : {}) });
  if (!result.ok) return toLoaderResult(result, amb.mode);
  if (!belongsToWorkspace(result.data.items, ctx.workspace, (t) => t.providerId)) return toLoaderResult(fail("unavailable"), amb.mode);
  return toLoaderResult(ok({ rows: result.data.items.map(toTripRow), nextCursor: result.data.nextCursor }), amb.mode, (d) => d.rows.length === 0);
}

export async function loadTripDetail(ctx: WorkspaceLoaderContext, tripId: string): Promise<LoaderResult<TripRowVM>> {
  const amb = api(ctx);
  const result = await amb.getTrip(tripId);
  if (result.ok && result.data.providerId !== ctx.workspace.providerId) return toLoaderResult(fail("not_found"), amb.mode);
  return toLoaderResult(result.ok ? ok(toTripRow(result.data)) : result, amb.mode);
}

/** Driver view: the single current trip (or empty) plus a count of later assignments without detail. */
export async function loadDriverQueue(ctx: WorkspaceLoaderContext): Promise<LoaderResult<DriverQueueVM>> {
  const amb = api(ctx);
  const result = await amb.getDriverQueue();
  return toLoaderResult(
    result.ok ? ok({ current: result.data.current ? toDriverTrip(result.data.current) : null, laterCount: result.data.laterCount }) : result,
    amb.mode,
    (d) => d.current === null && d.laterCount === 0,
  );
}

/** Emergency placeholder: always unavailable, always shows 108. No adapter or API call involved. */
export function loadEmergencyPlaceholder(ctx: Pick<WorkspaceLoaderContext, "env"> = {}): EmergencyGuidance {
  return getEmergencyGuidance(ctx.env ?? process.env);
}

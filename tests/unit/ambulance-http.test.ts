import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/auth/http", async original => ({ ...await original<typeof import("@/lib/auth/http")>(), session: mock.session }));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), connection: async () => undefined }));
import { isEnabled } from "@/lib/feature-flags";
import { POST as requestTransport } from "@/app/api/bookings/transport/route";
import { GET as transportSlots } from "@/app/api/bookings/transport/slots/route";
import { GET as getTrip } from "@/app/api/bookings/[id]/trip/route";
import { POST as tripDestination } from "@/app/api/bookings/[id]/trip/destination/route";
import { POST as acceptTransport } from "@/app/api/bookings/[id]/trip/accept/route";
import { POST as enRoute } from "@/app/api/bookings/[id]/trip/en-route/route";
import { POST as arrived } from "@/app/api/bookings/[id]/trip/arrived/route";
import { POST as absence } from "@/app/api/bookings/[id]/trip/absence/route";
import { POST as pickedUp } from "@/app/api/bookings/[id]/trip/picked-up/route";
import { POST as destinationReached } from "@/app/api/bookings/[id]/trip/destination-reached/route";
import { POST as interrupt } from "@/app/api/bookings/[id]/trip/interrupt/route";
import { GET as tripQueue } from "@/app/api/provider/ambulance/queue/route";
import { GET as driverTrips } from "@/app/api/driver/trips/route";
import { GET as fleet } from "@/app/api/provider/ambulance/fleet/route";
import { POST as registerVehicle } from "@/app/api/provider/ambulance/vehicles/route";
import { POST as addDocument } from "@/app/api/provider/ambulance/vehicles/[id]/documents/route";
import { POST as submitVehicle } from "@/app/api/provider/ambulance/vehicles/[id]/submit/route";
import { POST as setDriver } from "@/app/api/provider/ambulance/drivers/route";
import { POST as readTicket } from "@/app/api/ambulance/vehicle-documents/[id]/read-ticket/route";
import { POST as reviewVehicle } from "@/app/api/admin/ambulance/vehicles/[id]/review/route";

const id = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const key = "10000000-0000-4000-8000-0000000000aa";
const ctx = { params: Promise.resolve({ id }) };
const post = (path: string, body: unknown, withKey = true) => new Request(`http://localhost${path}`, { method: "POST",
  headers: { "Content-Type": "application/json", ...(withKey ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(body) });
const get = (path: string) => new Request(`http://localhost${path}`);
const requestBody = { patientId: id, serviceId: id, pickupAddressId: id, destinationAddressId: other, requirement: "seated", startAt: "2027-01-01T09:00:00Z" };
const slotsPath = `/api/bookings/transport/slots?provider=SCV-AMB-000001&service=${id}&date=2027-01-01&requirement=wheelchair`;

beforeEach(() => {
  mock.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  mock.session.mockReset().mockResolvedValue({ db: { rpc: mock.rpc } });
  vi.stubEnv("FEATURE_SCHEDULED_TRANSPORT", "true");
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("feature flag", () => {
  it("scheduledTransport is off by default and on only for the exact string true", () => {
    expect(isEnabled("scheduledTransport", {})).toBe(false);
    expect(isEnabled("scheduledTransport", { FEATURE_SCHEDULED_TRANSPORT: "1" })).toBe(false);
    expect(isEnabled("scheduledTransport", { FEATURE_SCHEDULED_TRANSPORT: "TRUE" })).toBe(false);
    expect(isEnabled("scheduledTransport", { FEATURE_SCHEDULED_TRANSPORT: "true" })).toBe(true);
  });
});

describe("admission routes", () => {
  it.each(["", "false", "1"])("env flag %j: slots, request and accept answer 503 without an RPC or session", async value => {
    vi.stubEnv("FEATURE_SCHEDULED_TRANSPORT", value);
    for (const res of [await requestTransport(post("/api/bookings/transport", requestBody)), await transportSlots(get(slotsPath)),
      await acceptTransport(post(`/api/bookings/${id}/trip/accept`, { expectedVersion: 2, driverResourceId: id, vehicleResourceId: other }), ctx)]) {
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: { code: "feature_unavailable" } });
    }
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.session).not.toHaveBeenCalled();
  });

  it("request maps to request_transport with the Idempotency-Key and answers 201", async () => {
    mock.rpc.mockResolvedValue({ data: other, error: null });
    const res = await requestTransport(post("/api/bookings/transport", requestBody));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: other });
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mock.rpc).toHaveBeenCalledWith("request_transport", { p_patient_id: id, p_service_id: id, p_pickup_address_id: id,
      p_destination_address_id: other, p_requirement_code: "seated", p_start_at: "2027-01-01T09:00:00Z", p_request_key: key });
  });

  it("request needs an Idempotency-Key", async () => {
    const res = await requestTransport(post("/api/bookings/transport", requestBody, false));
    expect(res.status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it.each(["lat", "lng", "location", "coordinates", "eta", "distance", "category", "price", "amount"])("request body with %s is refused", async extra => {
    const res = await requestTransport(post("/api/bookings/transport", { ...requestBody, [extra]: 1 }));
    expect(res.status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("slots map the public reference and the requirement", async () => {
    mock.rpc.mockResolvedValue({ data: [], error: null });
    const res = await transportSlots(get(slotsPath));
    expect(await res.json()).toEqual({ slots: [], advisory: true });
    expect(mock.rpc).toHaveBeenCalledWith("list_transport_slots", { p_provider_reference: "SCV-AMB-000001", p_service_id: id,
      p_date: "2027-01-01", p_requirement: "wheelchair" });
  });

  it("accept maps to accept_transport with the key", async () => {
    mock.rpc.mockResolvedValue({ data: 4, error: null });
    const res = await acceptTransport(post(`/api/bookings/${id}/trip/accept`, { expectedVersion: 2, driverResourceId: id, vehicleResourceId: other }), ctx);
    expect(await res.json()).toEqual({ version: 4 });
    expect(mock.rpc).toHaveBeenCalledWith("accept_transport", { p_booking_id: id, p_expected_version: 2, p_driver_resource_id: id,
      p_vehicle_resource_id: other, p_request_key: key });
  });

  it.each(["feature_unavailable", "feature_suspended"])("database gate %s is 503 like the env flag", async message => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "55000", message } });
    const res = await acceptTransport(post(`/api/bookings/${id}/trip/accept`, { expectedVersion: 2, driverResourceId: id, vehicleResourceId: other }), ctx);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { code: "feature_unavailable" } });
  });
});

describe("trip steps", () => {
  const steps = [[enRoute, "en_route"], [arrived, "arrived"], [absence, "absence"], [pickedUp, "picked_up"], [destinationReached, "destination_reached"]] as const;

  it.each(steps)("route binds its fixed step %#", async (handler, step) => {
    mock.rpc.mockResolvedValue({ data: { version: 5, substate: step, blocked: null }, error: null });
    const res = await handler(post(`/api/bookings/${id}/trip/x`, { expectedVersion: 4 }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 5, substate: step });
    expect(mock.rpc).toHaveBeenCalledWith("advance_trip", { p_booking_id: id, p_step: step, p_expected_version: 4, p_request_key: key, p_reason: null });
  });

  it("steps, closeout and reads ignore the admission env flag", async () => {
    vi.stubEnv("FEATURE_SCHEDULED_TRANSPORT", "");
    mock.rpc.mockResolvedValue({ data: { version: 8, substate: "destination_reached", blocked: null }, error: null });
    expect((await destinationReached(post(`/api/bookings/${id}/trip/x`, { expectedVersion: 7 }), ctx)).status).toBe(200);
    mock.rpc.mockResolvedValue({ data: { trip: true }, error: null });
    expect((await getTrip(get(`/api/bookings/${id}/trip`), ctx)).status).toBe(200);
    expect((await tripDestination(post(`/api/bookings/${id}/trip/destination`, {}, false), ctx)).status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("get_trip", { p_booking_id: id });
    expect(mock.rpc).toHaveBeenCalledWith("get_trip_destination", { p_booking_id: id });
  });

  it("interrupt takes a driver reason only", async () => {
    mock.rpc.mockResolvedValue({ data: { version: 5, substate: "trip_interrupted", blocked: null }, error: null });
    const ok = await interrupt(post(`/api/bookings/${id}/trip/interrupt`, { expectedVersion: 4, reason: "vehicle_breakdown" }), ctx);
    expect(ok.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("advance_trip", expect.objectContaining({ p_step: "interrupt", p_reason: "vehicle_breakdown" }));
    mock.rpc.mockClear();
    for (const reason of ["ops_closeout", "provider_did_not_attend", undefined]) {
      const res = await interrupt(post(`/api/bookings/${id}/trip/interrupt`, { expectedVersion: 4, reason }), ctx);
      expect(res.status).toBe(422);
    }
    expect((await enRoute(post(`/api/bookings/${id}/trip/en-route`, { expectedVersion: 4, reason: "driver_unable" }), ctx)).status).toBe(422);
    expect((await enRoute(post(`/api/bookings/${id}/trip/en-route`, { expectedVersion: 4, lat: 17.4 }), ctx)).status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("steps need an Idempotency-Key", async () => {
    const res = await enRoute(post(`/api/bookings/${id}/trip/en-route`, { expectedVersion: 4 }, false), ctx);
    expect(res.status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("a recorded eligibility block is 409 eligibility_blocked with the new version", async () => {
    mock.rpc.mockResolvedValue({ data: { version: 5, substate: "assigned", blocked: "eligibility_blocked" }, error: null });
    const res = await enRoute(post(`/api/bookings/${id}/trip/en-route`, { expectedVersion: 4 }), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: "eligibility_blocked" }, version: 5 });
  });

  it("an unexpected database answer is 503, never echoed", async () => {
    mock.rpc.mockResolvedValue({ data: { version: "x" }, error: null });
    const res = await enRoute(post(`/api/bookings/${id}/trip/en-route`, { expectedVersion: 4 }), ctx);
    expect(res.status).toBe(503);
  });

  it.each([
    ["55000", "feature_suspended", 503, "feature_unavailable"], ["55000", "too_early", 409, "too_early"],
    ["55000", "resource_busy", 409, "resource_busy"], ["55000", "invalid_transition", 409, "invalid_transition"],
    ["55000", "something_else", 409, "conflict"], ["40001", "stale_version", 409, "stale_version"],
    ["40001", "idempotency_conflict", 409, "idempotency_conflict"], ["23P01", "conflicting key value", 409, "resource_conflict"],
    ["42501", "forbidden", 403, "forbidden"], ["P0002", "not_found", 404, "not_found"], ["22023", "invalid_reason", 422, "invalid_input"],
    ["53300", "pending_booking_limit", 429, "rate_limited"], ["XX000", "boom", 503, "ambulance_unavailable"],
  ])("SQLSTATE %s %s maps to %i %s", async (code, message, status, expected) => {
    mock.rpc.mockResolvedValue({ data: null, error: { code, message } });
    const res = await enRoute(post(`/api/bookings/${id}/trip/en-route`, { expectedVersion: 4 }), ctx);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: { code: expected } });
  });

  it("a deadlock is retried, a stale version is not", async () => {
    mock.rpc.mockResolvedValueOnce({ data: null, error: { code: "40P01", message: "deadlock" } })
      .mockResolvedValueOnce({ data: { version: 5, substate: "en_route", blocked: null }, error: null });
    expect((await enRoute(post(`/api/bookings/${id}/trip/en-route`, { expectedVersion: 4 }), ctx)).status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledTimes(2);
    mock.rpc.mockReset().mockResolvedValue({ data: null, error: { code: "40001", message: "stale_version" } });
    expect((await enRoute(post(`/api/bookings/${id}/trip/en-route`, { expectedVersion: 4 }), ctx)).status).toBe(409);
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("queues and fleet", () => {
  it("queue, driver trips and fleet map their query", async () => {
    mock.rpc.mockResolvedValue({ data: [], error: null });
    await tripQueue(get(`/api/provider/ambulance/queue?providerId=${id}&limit=5&cursor=${other}`));
    expect(mock.rpc).toHaveBeenLastCalledWith("list_trip_queue", { p_provider_id: id, p_limit: 5, p_after: other });
    await driverTrips(get("/api/driver/trips"));
    expect(mock.rpc).toHaveBeenLastCalledWith("list_driver_trips", { p_limit: 20, p_after: null });
    await fleet(get(`/api/provider/ambulance/fleet?providerId=${id}`));
    expect(mock.rpc).toHaveBeenLastCalledWith("get_fleet", { p_provider_id: id });
    expect((await tripQueue(get(`/api/provider/ambulance/queue?providerId=${id}&limit=51`))).status).toBe(422);
    expect((await driverTrips(get("/api/driver/trips?limit=1&limit=2"))).status).toBe(422);
  });

  it("fleet commands map their bodies", async () => {
    mock.rpc.mockResolvedValue({ data: 1, error: null });
    await registerVehicle(post("/api/provider/ambulance/vehicles", { providerId: id, resourceId: other, vehicleType: "basic", supports: ["seated"], expectedVersion: 0 }, false));
    expect(mock.rpc).toHaveBeenLastCalledWith("register_ambulance_vehicle", { p_provider_id: id, p_resource_id: other, p_vehicle_type: "basic",
      p_supports: ["seated"], p_expected_version: 0 });
    await addDocument(post(`/api/provider/ambulance/vehicles/${id}/documents`, { kind: "insurance", contentType: "application/pdf", expiresAt: "2027-06-01T00:00:00Z", expectedVersion: 1 }, false), ctx);
    expect(mock.rpc).toHaveBeenLastCalledWith("add_vehicle_document", { p_resource_id: id, p_kind: "insurance", p_content_type: "application/pdf",
      p_expires_at: "2027-06-01T00:00:00Z", p_expected_version: 1 });
    await submitVehicle(post(`/api/provider/ambulance/vehicles/${id}/submit`, { expectedVersion: 5 }, false), ctx);
    expect(mock.rpc).toHaveBeenLastCalledWith("submit_vehicle_case", { p_resource_id: id, p_expected_version: 5 });
    await setDriver(post("/api/provider/ambulance/drivers", { providerId: id, resourceId: other, status: "disabled", expectedVersion: 2 }, false));
    expect(mock.rpc).toHaveBeenLastCalledWith("set_ambulance_driver", { p_provider_id: id, p_resource_id: other, p_status: "disabled", p_expected_version: 2 });
    await reviewVehicle(post(`/api/admin/ambulance/vehicles/${id}/review`, { decision: "approved", reason: " Papers checked ", expectedVersion: 6 }, false), ctx);
    expect(mock.rpc).toHaveBeenLastCalledWith("review_vehicle_case", { p_resource_id: id, p_decision: "approved", p_reason: "Papers checked", p_expected_version: 6 });
  });

  it("read ticket returns the single ticket row", async () => {
    const row = { bucket: "provider-verification", object_path: `vehicle/${id}/${other}.pdf`, ticket_expires_at: "2027-01-01T00:01:00Z" };
    mock.rpc.mockResolvedValue({ data: [row], error: null });
    const res = await readTicket(post(`/api/ambulance/vehicle-documents/${other}/read-ticket`, { purpose: "admin_review" }, false), ctx);
    expect(await res.json()).toEqual({ ticket: row });
    expect(mock.rpc).toHaveBeenCalledWith("authorize_vehicle_document_read", { p_document_id: id, p_purpose: "admin_review" });
  });

  it("fleet routes ignore the admission env flag", async () => {
    vi.stubEnv("FEATURE_SCHEDULED_TRANSPORT", "");
    mock.rpc.mockResolvedValue({ data: {}, error: null });
    expect((await fleet(get(`/api/provider/ambulance/fleet?providerId=${id}`))).status).toBe(200);
  });
});

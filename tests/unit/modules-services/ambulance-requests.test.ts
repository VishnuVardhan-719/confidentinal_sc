import { describe, expect, it } from "vitest";
import { createSyntheticMarketplaceStore } from "@/fixtures/marketplace/booking-store";
import { SYNTHETIC_HOME_ADDRESS_ID, SYNTHETIC_SELF_PATIENT_ID } from "@/fixtures/marketplace/patient";
import { createAmbulanceRequestsFixtureApi, SYNTHETIC_AMBULANCE_OPERATORS, SYNTHETIC_DECLINING_OPERATOR_ID } from "@/modules/ambulance-requests/fixture";
import { createAmbulanceRequestsHttpApi } from "@/modules/ambulance-requests/http";
import { ambulanceLines } from "@/modules/ambulance-requests/pricing";
import { ambulanceRequestInputSchema, ambulanceRequestSchema } from "@/modules/ambulance-requests/schemas";
import { ambulanceRecordPresentation } from "@/modules/ambulance-requests/status";
import type { AmbulanceRequestDetails } from "@/modules/ambulance-requests/types";
import { createPatientFixtureApi } from "@/modules/patient/fixture";
import type { RequestStore } from "@/modules/service-requests/fixture-engine";

const env = { FRONTEND_ADAPTER: "fixture", APP_ENV: "test", FIXTURE_PROVIDER_RESPONSE_MS: "1000" };
const ONE = SYNTHETIC_AMBULANCE_OPERATORS[0];
const TWO = SYNTHETIC_AMBULANCE_OPERATORS[1];

function setup() {
  let clock = Date.parse("2026-11-20T00:00:00Z");
  const now = () => new Date(clock);
  const store: RequestStore<AmbulanceRequestDetails> = { records: new Map(), intents: new Map(), respondAt: new Map() };
  const patient = createPatientFixtureApi({ env, store: createSyntheticMarketplaceStore(env, now) });
  return { api: createAmbulanceRequestsFixtureApi({ env, patient, now, store }), advance: (ms: number) => { clock += ms; } };
}
const input = (overrides: Record<string, unknown> = {}) => ({
  providerId: ONE.id, patientId: SYNTHETIC_SELF_PATIENT_ID, addressId: SYNTHETIC_HOME_ADDRESS_ID, startAt: "2026-11-21T03:30:00.000Z",
  vehicleType: "patient_transport", mobility: "wheelchair", companion: true, notEmergency: true, policyAccepted: true, expectedTotalPaise: 120000,
  destination: { kind: "hospital", name: "Synthetic general hospital", locality: "Synthetic locality B", city: "Hyderabad", pin: "500032" }, ...overrides,
});

describe("ambulance request schemas and pricing", () => {
  it("requires the not-an-emergency confirmation, a fitting vehicle and a full destination", () => {
    expect(ambulanceRequestInputSchema.safeParse(input()).success).toBe(true);
    expect(ambulanceRequestInputSchema.safeParse(input({ notEmergency: false })).success).toBe(false);
    expect(ambulanceRequestInputSchema.safeParse(input({ mobility: "stretcher", vehicleType: "wheelchair_van" })).success).toBe(false);
    expect(ambulanceRequestInputSchema.safeParse(input({ vehicleType: "air_ambulance" })).success).toBe(false);
    expect(ambulanceRequestInputSchema.safeParse(input({ destination: { kind: "home", locality: "x", city: "Hyderabad", pin: "500032" } })).success).toBe(false);
    expect(ambulanceRequestInputSchema.safeParse(input({ destination: { kind: "home", locality: "Synthetic", city: "Hyderabad", pin: "050032" } })).success).toBe(false);
  });

  it("uses the operator's fixed fare per vehicle, with no distance estimate", () => {
    expect(ambulanceLines(ONE, "basic_life_support")).toEqual([{ key: "vehicle:basic_life_support", label: "Scheduled transfer", quantity: 1, unitPaise: 250000, amountPaise: 250000 }]);
    expect(ambulanceLines(TWO, "wheelchair_van")).toBe("validation");
    expect(ambulanceRecordPresentation().labelKey).toBe("services.ambulance.record.none");
  });
});

describe("ambulance requests fixture adapter", () => {
  it("books a scheduled transfer the operator confirms; a drop-off outside the area is refused", async () => {
    const { api, advance } = setup();
    const slots = await api.slots(ONE.id);
    if (!slots.ok) throw new Error("no slots");
    const startAt = slots.data.items[0].startAt;
    const outside = await api.create(input({ startAt, destination: { kind: "home", locality: "Synthetic far", city: "Hyderabad", pin: "500081" } }), crypto.randomUUID());
    expect(!outside.ok && outside.error.code).toBe("validation");
    const created = await api.create(input({ startAt }), crypto.randomUUID());
    if (!created.ok) throw new Error("create failed");
    advance(1000);
    const row = await api.get(created.data.id);
    expect(row.ok && row.data.status).toBe("CONFIRMED");
    expect(row.ok && row.data.totalPaise).toBe(120000);
    expect(row.ok && row.data.details.destination.name).toBe("Synthetic general hospital");
    expect(row.ok && ambulanceRequestSchema.safeParse(row.data).success).toBe(true);
  });

  it("the declining operator declines", async () => {
    const { api, advance } = setup();
    const slots = await api.slots(TWO.id);
    if (!slots.ok) throw new Error("no slots");
    const created = await api.create(input({ providerId: TWO.id, startAt: slots.data.items[0].startAt, expectedTotalPaise: 110000,
      destination: { kind: "home", locality: "Synthetic locality D", city: "Secunderabad", pin: "500003" } }), crypto.randomUUID());
    if (!created.ok) throw new Error("create failed");
    advance(1000);
    const row = await api.get(created.data.id);
    expect(TWO.id).toBe(SYNTHETIC_DECLINING_OPERATOR_ID);
    expect(row.ok && row.data.status).toBe("DECLINED");
  });

  it("http adapter fails closed", async () => {
    const result = await createAmbulanceRequestsHttpApi().create(input(), crypto.randomUUID());
    expect(!result.ok && result.error.code).toBe("gated");
  });
});

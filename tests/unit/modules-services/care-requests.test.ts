import { describe, expect, it } from "vitest";
import { createSyntheticMarketplaceStore } from "@/fixtures/marketplace/booking-store";
import { SYNTHETIC_HOME_ADDRESS_ID, SYNTHETIC_SELF_PATIENT_ID } from "@/fixtures/marketplace/patient";
import { createCareRequestsFixtureApi, SYNTHETIC_CARETAKERS, SYNTHETIC_DECLINING_CARETAKER_ID } from "@/modules/care-requests/fixture";
import { createCareRequestsHttpApi } from "@/modules/care-requests/http";
import { careLines } from "@/modules/care-requests/pricing";
import { careRequestInputSchema, careRequestSchema } from "@/modules/care-requests/schemas";
import { careRecordPresentation, careRequestStatusPresentation } from "@/modules/care-requests/status";
import type { CareRequestDetails } from "@/modules/care-requests/types";
import { createPatientFixtureApi } from "@/modules/patient/fixture";
import type { RequestStore } from "@/modules/service-requests/fixture-engine";

const env = { FRONTEND_ADAPTER: "fixture", APP_ENV: "test", FIXTURE_PROVIDER_RESPONSE_MS: "1000" };
const ONE = SYNTHETIC_CARETAKERS[0];
const AGENCY = SYNTHETIC_CARETAKERS[1];

function setup() {
  let clock = Date.parse("2026-11-20T00:00:00Z");
  const now = () => new Date(clock);
  const store: RequestStore<CareRequestDetails> = { records: new Map(), intents: new Map(), respondAt: new Map() };
  const patient = createPatientFixtureApi({ env, store: createSyntheticMarketplaceStore(env, now) });
  return { api: createCareRequestsFixtureApi({ env, patient, now, store }), advance: (ms: number) => { clock += ms; } };
}
const input = (overrides: Record<string, unknown> = {}) => ({
  providerId: ONE.id, patientId: SYNTHETIC_SELF_PATIENT_ID, addressId: SYNTHETIC_HOME_ADDRESS_ID, startAt: "2026-11-21T02:30:00.000Z",
  tasks: ["companionship", "meal_help"], hours: 4, scopeAcknowledged: true, policyAccepted: true, expectedTotalPaise: 100000, ...overrides,
});

describe("care request schemas and pricing", () => {
  it("needs tasks, whole hours in range and the non-clinical acknowledgement", () => {
    expect(careRequestInputSchema.safeParse(input()).success).toBe(true);
    expect(careRequestInputSchema.safeParse(input({ tasks: [] })).success).toBe(false);
    expect(careRequestInputSchema.safeParse(input({ tasks: ["injections"] })).success).toBe(false);
    expect(careRequestInputSchema.safeParse(input({ tasks: ["meal_help", "meal_help"] })).success).toBe(false);
    expect(careRequestInputSchema.safeParse(input({ hours: 2.5 })).success).toBe(false);
    expect(careRequestInputSchema.safeParse(input({ hours: 13 })).success).toBe(false);
    expect(careRequestInputSchema.safeParse(input({ scopeAcknowledged: false })).success).toBe(false);
  });

  it("prices the provider's hourly rate times hours, inside the provider's range", () => {
    expect(careLines(ONE, 4)).toEqual([{ key: "hours", label: "Care hours", quantity: 4, unitPaise: 25000, amountPaise: 100000 }]);
    expect(careLines(ONE, 1)).toBe("validation");
    expect(careLines(ONE, 9)).toBe("validation");
  });

  it("keeps the record badge separate and non-clinical", () => {
    expect(careRequestStatusPresentation("REQUESTED").labelKey).toBe("booking.status.requested");
    expect(careRecordPresentation().labelKey).toBe("services.care.record.nonClinical");
  });
});

describe("care requests fixture adapter", () => {
  it("creates a shift, blocks overlapping starts for its full length, then the caretaker confirms", async () => {
    const { api, advance } = setup();
    const slots = await api.slots(ONE.id);
    if (!slots.ok) throw new Error("no slots");
    const first = slots.data.items[0].startAt;
    const created = await api.create(input({ startAt: first }), crypto.randomUUID());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const after = await api.slots(ONE.id);
    // 4 hours from the first start hides that start and the next one two hours later.
    expect(after.ok && after.data.items.some(slot => slot.startAt === first)).toBe(false);
    expect(after.ok && after.data.items.some(slot => Date.parse(slot.startAt) === Date.parse(first) + 2 * 3_600_000)).toBe(false);
    advance(1000);
    const row = await api.get(created.data.id);
    expect(row.ok && row.data.status).toBe("CONFIRMED");
    expect(row.ok && row.data.details).toEqual({ kind: "independent", tasks: ["companionship", "meal_help"], hours: 4 });
    expect(row.ok && careRequestSchema.safeParse(row.data).success).toBe(true);
  });

  it("refuses tasks the provider does not offer, hours outside its range, and the agency declines", async () => {
    const { api, advance } = setup();
    const slots = await api.slots(AGENCY.id);
    if (!slots.ok) throw new Error("no slots");
    const startAt = slots.data.items[0].startAt;
    const task = await api.create(input({ providerId: AGENCY.id, startAt, tasks: ["medicine_reminder"], expectedTotalPaise: 120000 }), crypto.randomUUID());
    expect(!task.ok && task.error.code).toBe("validation");
    const short = await api.create(input({ providerId: AGENCY.id, startAt, tasks: ["companionship"], hours: 2, expectedTotalPaise: 60000 }), crypto.randomUUID());
    expect(!short.ok && short.error.code).toBe("validation");
    const ok = await api.create(input({ providerId: AGENCY.id, startAt, tasks: ["companionship"], hours: 4, expectedTotalPaise: 120000 }), crypto.randomUUID());
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    advance(1000);
    const row = await api.get(ok.data.id);
    expect(AGENCY.id).toBe(SYNTHETIC_DECLINING_CARETAKER_ID);
    expect(row.ok && row.data.status).toBe("DECLINED");
    expect(row.ok && row.data.payment.amountDuePaise).toBe(0);
  });

  it("http adapter fails closed", async () => {
    const api = createCareRequestsHttpApi();
    const result = await api.create(input(), crypto.randomUUID());
    expect(!result.ok && result.error.code).toBe("gated");
  });
});

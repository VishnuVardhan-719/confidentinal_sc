import { describe, expect, it } from "vitest";
import { createSyntheticMarketplaceStore } from "@/fixtures/marketplace/booking-store";
import { SYNTHETIC_HOME_ADDRESS_ID, SYNTHETIC_OTHER_ADDRESS_ID, SYNTHETIC_SELF_PATIENT_ID } from "@/fixtures/marketplace/patient";
import { createLabOrdersFixtureApi, SYNTHETIC_DECLINING_LAB_ID, SYNTHETIC_LABS } from "@/modules/lab-orders/fixture";
import { createLabOrdersHttpApi } from "@/modules/lab-orders/http";
import { labLines } from "@/modules/lab-orders/pricing";
import { labOrderInputSchema, labOrderSchema } from "@/modules/lab-orders/schemas";
import { labOrderStatusPresentation, labPaymentPresentation, labReportPresentation } from "@/modules/lab-orders/status";
import { createPatientFixtureApi } from "@/modules/patient/fixture";
import { cancelState, leadFor } from "@/modules/service-requests/core";
import type { RequestStore } from "@/modules/service-requests/fixture-engine";
import type { LabOrderDetails } from "@/modules/lab-orders/types";

const env = { FRONTEND_ADAPTER: "fixture", APP_ENV: "test", FIXTURE_PROVIDER_RESPONSE_MS: "1000" };
const LAB_1 = SYNTHETIC_LABS[0];
const LAB_2 = SYNTHETIC_LABS[1];

function setup(start = Date.parse("2026-11-20T00:00:00Z")) {
  let clock = start;
  const now = () => new Date(clock);
  const store: RequestStore<LabOrderDetails> = { records: new Map(), intents: new Map(), respondAt: new Map() };
  const patient = createPatientFixtureApi({ env, store: createSyntheticMarketplaceStore(env, now) });
  // An isolated store per test (the factory's default is process-wide).
  const api = createLabOrdersFixtureApi({ env, patient, now, store });
  return { api, store, advance: (ms: number) => { clock += ms; }, now };
}

async function firstSlot(api: ReturnType<typeof setup>["api"], providerId: string) {
  const slots = await api.slots(providerId);
  if (!slots.ok) throw new Error("no slots");
  return slots.data.items[0].startAt;
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    providerId: LAB_1.id, patientId: SYNTHETIC_SELF_PATIENT_ID, addressId: SYNTHETIC_HOME_ADDRESS_ID,
    startAt: "2026-11-21T02:30:00.000Z", testIds: [LAB_1.tests[0].id, LAB_1.tests[1].id],
    preparationAcknowledged: true, policyAccepted: true, expectedTotalPaise: 35000 + 15000 + 10000, ...overrides,
  };
}

describe("lab order schemas", () => {
  it("accepts a complete order and rejects missing consent, duplicates and empty tests", () => {
    expect(labOrderInputSchema.safeParse(input()).success).toBe(true);
    expect(labOrderInputSchema.safeParse(input({ preparationAcknowledged: false })).success).toBe(false);
    expect(labOrderInputSchema.safeParse(input({ policyAccepted: false })).success).toBe(false);
    expect(labOrderInputSchema.safeParse(input({ testIds: [] })).success).toBe(false);
    expect(labOrderInputSchema.safeParse(input({ testIds: [LAB_1.tests[0].id, LAB_1.tests[0].id.toUpperCase()] })).success).toBe(false);
    expect(labOrderInputSchema.safeParse(input({ expectedTotalPaise: 12.5 })).success).toBe(false);
    expect(labOrderInputSchema.safeParse(input({ note: "x".repeat(201) })).success).toBe(false);
    expect(labOrderInputSchema.safeParse({ ...input(), priceSnapshot: 1 }).success).toBe(false);
  });

  it("prices from the lab catalogue in integer paise, plus the collection fee", () => {
    const lines = labLines(LAB_1, [LAB_1.tests[0].id]);
    expect(lines).toEqual([
      { key: `test:${LAB_1.tests[0].id}`, label: "Complete blood count", quantity: 1, unitPaise: 35000, amountPaise: 35000 },
      { key: "collection", label: "Home collection", quantity: 1, unitPaise: 10000, amountPaise: 10000 },
    ]);
    expect(labLines(LAB_1, [LAB_2.tests[0].id])).toBe("validation");
    expect(labLines(LAB_1, [])).toBe("validation");
  });
});

describe("lab order status", () => {
  it("keeps booking, payment and report badges separate", () => {
    expect(labOrderStatusPresentation("CONFIRMED").labelKey).toBe("booking.status.confirmed");
    expect(labPaymentPresentation("DUE").labelKey).toBe("payment.status.due");
    expect(labReportPresentation("CONFIRMED").labelKey).toBe("services.lab.report.none");
    expect(labReportPresentation("COMPLETED").labelKey).toBe("services.lab.report.awaitingReview");
    expect(leadFor("ACCEPTED")).toBe("confirmed");
    expect(leadFor("EXPIRED")).toBe("expired");
  });

  it("allows cancelling while requested, and until two hours before a confirmed start", () => {
    const startAt = "2026-11-21T10:00:00.000Z";
    expect(cancelState({ status: "REQUESTED", startAt }, Date.parse(startAt))).toBe("open");
    expect(cancelState({ status: "CONFIRMED", startAt }, Date.parse(startAt) - 3 * 3_600_000)).toBe("open");
    expect(cancelState({ status: "CONFIRMED", startAt }, Date.parse(startAt) - 3_600_000)).toBe("closed");
    expect(cancelState({ status: "DECLINED", startAt }, 0)).toBe("final");
  });
});

describe("lab orders fixture adapter", () => {
  it("lists labs by PIN and offers future collection windows only", async () => {
    const { api } = setup();
    const all = await api.listProviders({});
    const near = await api.listProviders({ pin: "500081" });
    expect(all.ok && all.data.items.length).toBe(3);
    expect(near.ok && near.data.items.map(item => item.name)).toEqual(["Synthetic lab 3"]);
    expect((await api.listProviders({ pin: "012345" })).ok).toBe(false);
    const slots = await api.slots(LAB_1.id);
    expect(slots.ok && slots.data.items.length).toBeGreaterThan(10);
    expect(slots.ok && slots.data.items.every(slot => Date.parse(slot.startAt) >= Date.parse("2026-11-20T02:00:00Z"))).toBe(true);
  });

  it("creates once per idempotency key, then the lab accepts and confirms with a server reference", async () => {
    const { api, advance } = setup();
    const startAt = await firstSlot(api, LAB_1.id);
    const key = crypto.randomUUID();
    const created = await api.create(input({ startAt }), key);
    expect(created.ok).toBe(true);
    const again = await api.create(input({ startAt }), key);
    expect(again.ok && created.ok && again.data.id === created.data.id).toBe(true);
    expect((await api.create(input({ startAt, note: "changed" }), key)).ok).toBe(false);
    if (!created.ok) return;
    const pending = await api.get(created.data.id);
    expect(pending.ok && pending.data.status).toBe("REQUESTED");
    expect(pending.ok && pending.data.publicReference).toBeNull();
    expect(pending.ok && pending.data.totalPaise).toBe(60000);
    expect(pending.ok && labOrderSchema.safeParse(pending.data).success).toBe(true);
    advance(1000);
    const done = await api.get(created.data.id);
    expect(done.ok && done.data.status).toBe("CONFIRMED");
    expect(done.ok && done.data.publicReference).toMatch(/^SCV-[0-9A-F]{6}$/);
    expect(done.ok && done.data.payment).toEqual({ status: "DUE", amountDuePaise: 60000 });
    expect(done.ok && done.data.events.map(event => event.status)).toEqual(["REQUESTED", "ACCEPTED", "CONFIRMED"]);
  });

  it("the declining lab declines and nothing is due", async () => {
    const { api, advance } = setup();
    const startAt = await firstSlot(api, LAB_2.id);
    const created = await api.create(input({ providerId: LAB_2.id, startAt, testIds: [LAB_2.tests[0].id], expectedTotalPaise: 30000 }), crypto.randomUUID());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    advance(1000);
    const row = await api.get(created.data.id);
    expect(LAB_2.id).toBe(SYNTHETIC_DECLINING_LAB_ID);
    expect(row.ok && row.data.status).toBe("DECLINED");
    expect(row.ok && row.data.payment.amountDuePaise).toBe(0);
    expect(row.ok && (await api.cancel(row.data.id, { expectedVersion: row.data.version })).ok).toBe(false);
  });

  it("refuses a changed price, an uncovered address, a taken window and a stale cancel", async () => {
    const { api, advance } = setup();
    const startAt = await firstSlot(api, LAB_1.id);
    const changed = await api.create(input({ startAt, expectedTotalPaise: 1 }), crypto.randomUUID());
    expect(!changed.ok && changed.error.code).toBe("conflict");
    const outside = await api.create(input({ providerId: SYNTHETIC_LABS[2].id, startAt, testIds: [SYNTHETIC_LABS[2].tests[0].id], expectedTotalPaise: 135000 }), crypto.randomUUID());
    expect(!outside.ok && outside.error.code).toBe("validation");
    const first = await api.create(input({ startAt }), crypto.randomUUID());
    const taken = await api.create(input({ startAt, addressId: SYNTHETIC_OTHER_ADDRESS_ID }), crypto.randomUUID());
    expect(!taken.ok && taken.error.code).toBe("conflict");
    if (!first.ok) throw new Error("create failed");
    advance(1000);
    const stale = await api.cancel(first.data.id, { expectedVersion: 1 });
    expect(!stale.ok && stale.error.code).toBe("conflict");
    const current = await api.get(first.data.id);
    if (!current.ok) throw new Error("get failed");
    const cancelled = await api.cancel(first.data.id, { expectedVersion: current.data.version });
    expect(cancelled.ok).toBe(true);
    const after = await api.get(first.data.id);
    expect(after.ok && after.data.status).toBe("CANCELLED");
    expect(after.ok && after.data.payment.amountDuePaise).toBe(0);
    const slots = await api.slots(LAB_1.id);
    expect(slots.ok && slots.data.items.some(slot => slot.startAt === startAt)).toBe(true);
  });

  it("is refused outside fixture mode and in production", () => {
    const patient = createPatientFixtureApi({ env });
    expect(() => createLabOrdersFixtureApi({ env: { ...env, APP_ENV: "production" }, patient })).toThrow();
    expect(() => createLabOrdersFixtureApi({ env: { APP_ENV: "test" }, patient })).toThrow();
  });
});

describe("lab orders http adapter", () => {
  it("validates then fails closed until a backend contract exists", async () => {
    const api = createLabOrdersHttpApi();
    const listed = await api.listProviders({});
    expect(!listed.ok && listed.error.code).toBe("gated");
    const bad = await api.create({ providerId: "x" }, crypto.randomUUID());
    expect(!bad.ok && bad.error.code).toBe("validation");
    const good = await api.create(input(), crypto.randomUUID());
    expect(!good.ok && good.error.code).toBe("gated");
  });
});

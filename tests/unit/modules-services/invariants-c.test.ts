import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSyntheticMarketplaceStore } from "@/fixtures/marketplace/booking-store";
import { SYNTHETIC_FAMILY_PATIENT_ID, SYNTHETIC_HOME_ADDRESS_ID, SYNTHETIC_SELF_PATIENT_ID } from "@/fixtures/marketplace/patient";
import { formatDateTime, formatPaise } from "@/lib/format";
import { SYNTHETIC_AMBULANCE_OPERATORS } from "@/modules/ambulance-requests/fixture";
import { ambulanceRecordPresentation } from "@/modules/ambulance-requests/status";
import { bookingStatusPresentation } from "@/modules/bookings/status";
import { SYNTHETIC_CARETAKERS } from "@/modules/care-requests/fixture";
import { careRecordPresentation } from "@/modules/care-requests/status";
import { createLabOrdersFixtureApi, SYNTHETIC_LABS } from "@/modules/lab-orders/fixture";
import { labReportPresentation } from "@/modules/lab-orders/status";
import type { LabOrderDetails } from "@/modules/lab-orders/types";
import { createPatientFixtureApi } from "@/modules/patient/fixture";
import { createPaymentsHttpApi } from "@/modules/payments/http";
import { paymentStatusPresentation } from "@/modules/payments/status";
import { REQUEST_STATUSES } from "@/modules/service-requests/core";
import type { RequestStore } from "@/modules/service-requests/fixture-engine";

/**
 * R9-C adversarial invariants for fe-c's areas (docs/frontend/AUDIT_C.md). Static scans cover the whole src tree
 * so a later change anywhere cannot quietly add browser storage, a live payment call or an emergency dispatch.
 */
const SRC = path.resolve(import.meta.dirname, "../../../src");
function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}
const ALL = sources().map(file => ({ file: path.relative(SRC, file).replace(/\\/g, "/"), text: readFileSync(file, "utf8") }));
const OWN = /^(app\/\[locale\]\/patient\/(book|lab-tests|caretakers|ambulance)|app\/\[locale\]\/\(public\)\/(doctors|lab-tests)|components\/(booking|service-requests|directory)|modules\/(service-requests|lab-orders|care-requests|ambulance-requests|bookings))\//;

describe("no private data in browser storage or URLs", () => {
  it("no source file reads or writes localStorage or sessionStorage", () => {
    expect(ALL.filter(f => /\b(localStorage|sessionStorage)\b/.test(f.text)).map(f => f.file)).toEqual([]);
  });

  it("fe-c links and redirects carry only public ids and filters in the query string", () => {
    const allowed = new Set(["providerId", "serviceId", "pin", "next", "speciality", "sort", "showFull", "availability", "queue", "test", "city"]);
    const offenders: string[] = [];
    for (const f of ALL.filter(item => OWN.test(item.file))) {
      for (const match of f.text.matchAll(/[?&]([a-zA-Z]+)=\$?\{?/g)) if (!allowed.has(match[1])) offenders.push(`${f.file}: ${match[1]}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("money is integer paise, shown in Indian format", () => {
  it("formats with Indian grouping in every locale and refuses fractional or negative paise", () => {
    for (const locale of ["en", "te", "hi"] as const) expect(formatPaise(123456750, locale)).toBe("₹12,34,567.50");
    expect(() => formatPaise(10.5)).toThrow();
    expect(() => formatPaise(-1)).toThrow();
  });

  it("every synthetic provider price is a nonnegative integer number of paise", () => {
    const prices = [
      ...SYNTHETIC_LABS.flatMap(lab => [lab.collectionFeePaise, ...lab.tests.map(test => test.pricePaise)]),
      ...SYNTHETIC_CARETAKERS.map(care => care.hourlyRatePaise),
      ...SYNTHETIC_AMBULANCE_OPERATORS.flatMap(op => op.vehicles.map(vehicle => vehicle.farePaise)),
    ];
    expect(prices.every(value => Number.isSafeInteger(value) && value >= 0)).toBe(true);
  });

  it("fe-c code never does float money maths on rupees", () => {
    const offenders = ALL.filter(f => OWN.test(f.file) && /(Paise|paise)\s*\/\s*100\b(?!\))/.test(f.text) && !/formatPaise/.test(f.file)).map(f => f.file);
    expect(offenders).toEqual([]);
  });
});

describe("times are stored in UTC and shown in India time", () => {
  it("shows a UTC instant as Asia/Kolkata wall-clock time regardless of the machine timezone", () => {
    expect(formatDateTime("2026-11-20T03:30:00Z", "en")).toMatch(/9:00\s*am/i);
  });

  it("fixture slots are UTC ISO instants on the advertised IST times", async () => {
    const now = () => new Date("2026-11-20T00:00:00Z");
    const patient = createPatientFixtureApi({ env: { FRONTEND_ADAPTER: "fixture", APP_ENV: "test" }, store: createSyntheticMarketplaceStore({}, now) });
    const api = createLabOrdersFixtureApi({ env: { FRONTEND_ADAPTER: "fixture", APP_ENV: "test" }, patient, now, store: { records: new Map(), intents: new Map(), respondAt: new Map() } });
    const slots = await api.slots(SYNTHETIC_LABS[0].id);
    if (!slots.ok) throw new Error("no slots");
    for (const slot of slots.data.items) {
      expect(slot.startAt).toMatch(/Z$/);
      const ist = new Date(Date.parse(slot.startAt) + 330 * 60_000).toISOString().slice(11, 16);
      expect(["07:00", "08:00", "09:00", "10:00", "11:00"]).toContain(ist);
    }
  });
});

describe("booking, payment and clinical states stay separate", () => {
  it("each badge comes from its own label family", () => {
    for (const status of REQUEST_STATUSES) {
      expect(bookingStatusPresentation(status).labelKey.startsWith("booking.status.")).toBe(true);
      expect(labReportPresentation(status).labelKey.startsWith("services.lab.report.")).toBe(true);
    }
    for (const status of ["NOT_INITIATED", "DUE", "PAID"]) expect(paymentStatusPresentation(status).labelKey.startsWith("payment.status.")).toBe(true);
    expect(careRecordPresentation().labelKey).toBe("services.care.record.nonClinical");
    expect(ambulanceRecordPresentation().labelKey).toBe("services.ambulance.record.none");
  });
});

describe("live payments are disabled", () => {
  it("no source file calls a payment gateway or creates a payment order", () => {
    const offenders = ALL.filter(f => /razorpay\.com|checkout\.razorpay|\/payment-order|new Razorpay|stripe\.com/i.test(f.text)).map(f => f.file);
    expect(offenders).toEqual([]);
  });

  it("the payments HTTP adapter fails closed", async () => {
    const result = await createPaymentsHttpApi().getSummary("00000000-0000-4000-8000-000000000071");
    expect(!result.ok && result.error.code).toBe("gated");
  });
});

describe("server-side session checks on every fe-c patient route and action", () => {
  it("every owned patient page and server-action file checks the patient session on the server", () => {
    const files = ALL.filter(f => /^app\/\[locale\]\/patient\/(book|lab-tests|caretakers|ambulance)\/.*(page|actions)\.tsx?$/.test(f.file));
    expect(files.length).toBeGreaterThanOrEqual(14);
    const missing = files.filter(f => !/getPatientSession\(\)/.test(f.text) || /^"use client"/.test(f.text)).map(f => f.file);
    expect(missing).toEqual([]);
  });

  it("a service request of another patient is not visible or cancellable", async () => {
    const env = { FRONTEND_ADAPTER: "fixture", APP_ENV: "test", FIXTURE_PROVIDER_RESPONSE_MS: "100000" };
    const now = () => new Date("2026-11-20T00:00:00Z");
    const store: RequestStore<LabOrderDetails> = { records: new Map(), intents: new Map(), respondAt: new Map() };
    const patient = createPatientFixtureApi({ env, store: createSyntheticMarketplaceStore(env, now) });
    const api = createLabOrdersFixtureApi({ env, patient, now, store });
    const slots = await api.slots(SYNTHETIC_LABS[0].id);
    if (!slots.ok) throw new Error("no slots");
    const created = await api.create({ providerId: SYNTHETIC_LABS[0].id, patientId: SYNTHETIC_SELF_PATIENT_ID, addressId: SYNTHETIC_HOME_ADDRESS_ID,
      startAt: slots.data.items[0].startAt, testIds: [SYNTHETIC_LABS[0].tests[0].id], preparationAcknowledged: true, policyAccepted: true, expectedTotalPaise: 45000 }, crypto.randomUUID());
    if (!created.ok) throw new Error("create failed");
    // Someone else's record in the same store (a patient this account may not act for).
    const foreign = { ...store.records.get(created.data.id)!, id: crypto.randomUUID(), patientId: "00000000-0000-4000-8002-000000000099" };
    store.records.set(foreign.id, foreign);
    expect((await api.get(foreign.id)).ok).toBe(false);
    expect((await api.cancel(foreign.id, { expectedVersion: 1 })).ok).toBe(false);
    const list = await api.list();
    expect(list.ok && list.data.items.map(item => item.id)).toEqual([created.data.id]);
    // A family member without booking permission cannot be booked for.
    const family = await api.create({ providerId: SYNTHETIC_LABS[0].id, patientId: SYNTHETIC_FAMILY_PATIENT_ID, addressId: SYNTHETIC_HOME_ADDRESS_ID,
      startAt: slots.data.items[1].startAt, testIds: [SYNTHETIC_LABS[0].tests[0].id], preparationAcknowledged: true, policyAccepted: true, expectedTotalPaise: 45000 }, crypto.randomUUID());
    const members = await patient.listMembers();
    const canBook = members.ok && members.data.items.find(item => item.patientId === SYNTHETIC_FAMILY_PATIENT_ID)?.canBook;
    expect(family.ok).toBe(Boolean(canBook));
  });
});

describe("ambulance is scheduled transfer only", () => {
  it("ambulance pages render the 112 banner and no dispatch, ETA or tracking UI exists in fe-c code", () => {
    const pages = ALL.filter(f => /^app\/\[locale\]\/patient\/ambulance\/.*page\.tsx$/.test(f.file));
    expect(pages.length).toBe(3);
    expect(pages.filter(f => !/EmergencyBanner/.test(f.text)).map(f => f.file)).toEqual([]);
    const ui = ALL.filter(f => OWN.test(f.file) && /\b(dispatchNow|liveTracking|etaMinutes|trackAmbulance)\b/.test(f.text)).map(f => f.file);
    expect(ui).toEqual([]);
  });
});

describe("no hard-coded English in fe-c components", () => {
  it("JSX text and accessible-name attributes in fe-c .tsx files come from messages", () => {
    const offenders: string[] = [];
    for (const f of ALL.filter(item => OWN.test(item.file) && item.file.endsWith(".tsx"))) {
      const code = f.text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const match of code.matchAll(/(?<![=-])>\s*([A-Za-z][A-Za-z ,.'!?-]{2,})\s*</g)) offenders.push(`${f.file}: text "${match[1].trim()}"`);
      for (const match of code.matchAll(/\b(aria-label|title|placeholder|alt)="([A-Za-z][^"]*)"/g)) offenders.push(`${f.file}: ${match[1]}="${match[2]}"`);
    }
    expect(offenders).toEqual([]);
  });
});

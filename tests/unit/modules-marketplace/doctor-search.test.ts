import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpClient } from "@/lib/api/http";
import { fail } from "@/lib/api/result";
import { createDoctorSearchFixtureApi, createDoctorSearchHttpApi, DOCTOR_PAGE_SIZE } from "@/modules/providers/doctor-api";
import { doctorSearchParams, formatCoordinates, haversineKm, readDoctorSearch, taxonomySuggestions } from "@/modules/providers/doctor-search";
import { bookingReadiness, profileItemHref } from "@/modules/patient/readiness";
import { syntheticMembers, syntheticProfile } from "@/fixtures/marketplace/patient";
import { createBookingsFixtureApi } from "@/modules/bookings/fixture";
import { createPatientFixtureApi } from "@/modules/patient/fixture";

const env = { FRONTEND_ADAPTER: "fixture", APP_ENV: "test" };
const now = () => new Date("2026-11-19T04:00:00.000Z"); // 09:30 IST
const api = () => createDoctorSearchFixtureApi({ env, now });
afterEach(() => vi.unstubAllGlobals());

describe("doctor search URL", () => {
  it("round-trips public filters and omits defaults", () => {
    const params = doctorSearchParams({ q: "Synthetic", city: "Hyderabad", speciality: "paediatrics", feeMax: 90000, sort: "fee_asc", showFull: true, page: 2 });
    expect(params.toString()).toBe("q=Synthetic&city=Hyderabad&speciality=paediatrics&feeMax=90000&sort=fee_asc&showFull=1&page=2");
    const read = readDoctorSearch(params);
    expect(read.ok && doctorSearchParams(read.data).toString()).toBe(params.toString());
    expect(doctorSearchParams({}).toString()).toBe("");
  });
  it.each([
    "lat=17.5&lng=78.3", "q=a&q=b", "feeMax=12.5", "feeMax=-1", "speciality=astrology", "showFull=true", "page=0", "q=" + "x".repeat(81), "q=%3Cscript%3E", "city=500001",
  ])("rejects unsafe or unknown input %s", query => {
    expect(readDoctorSearch(new URLSearchParams(query)).ok).toBe(false);
  });
  it("ignores empty form values", () => {
    expect(readDoctorSearch(new URLSearchParams("q=&city=&sort=nearest"))).toEqual({ ok: true, data: expect.objectContaining({ sort: "nearest", page: 1 }) });
  });
});

describe("doctor search fixture", () => {
  it("hides fully booked doctors unless asked and lists location-less doctors last", async () => {
    const hidden = await api().search({});
    expect(hidden.ok && hidden.data.items.every(item => item.openSlots !== 0)).toBe(true);
    const shown = await api().search({ showFull: true });
    expect(shown.ok && shown.data.items.some(item => item.openSlots === 0)).toBe(true);
    expect(shown.ok && shown.data.items.at(-1)?.location).toBeNull();
    expect(shown.ok && shown.data.items.every(item => item.rating === null && item.synthetic)).toBe(true);
  });
  it("sorts by fee and by availability", async () => {
    const fee = await api().search({ sort: "fee_asc" });
    const located = fee.ok ? fee.data.items.filter(item => item.location) : [];
    expect(located.map(item => item.feePaise)).toEqual([...located.map(item => item.feePaise)].sort((a, b) => a - b));
    const slots = await api().search({});
    const open = slots.ok ? slots.data.items.filter(item => item.location).map(item => item.openSlots ?? -1) : [];
    expect(open).toEqual([...open].sort((a, b) => b - a));
  });
  it("sorts nearest only with an explicit device origin", async () => {
    const without = await api().search({ sort: "nearest" });
    expect(without.ok && without.data.origin).toBe("none");
    expect(without.ok && without.data.items.every(item => item.distanceKm === null)).toBe(true);
    const near = await api().search({ sort: "nearest" }, { lat: 17.44, lng: 78.35, accuracyM: 137 });
    expect(near.ok && near.data.origin).toBe("device");
    const distances = near.ok ? near.data.items.filter(item => item.location).map(item => item.distanceKm ?? Infinity) : [];
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    expect(await api().search({}, { lat: 91, lng: 0, accuracyM: 1 })).toEqual(fail("validation"));
  });
  it("filters by symptom speciality, language, mode, experience and availability window", async () => {
    const symptom = await api().search({ symptom: "childFever" });
    expect(symptom.ok && symptom.data.items.map(item => item.specialities[0])).toEqual(["paediatrics"]);
    const telugu = await api().search({ language: "te", mode: "home_visit", experienceMin: 5 });
    expect(telugu.ok && telugu.data.items.every(item => item.languages.includes("te") && item.modes.includes("home_visit") && (item.experienceYears ?? 0) >= 5)).toBe(true);
    const today = await api().search({ availability: "today" });
    expect(today.ok && today.data.items.map(item => item.displayName).sort()).toEqual(["Synthetic doctor 1", "Synthetic doctor 5"]);
    const tomorrow = await api().search({ availability: "tomorrow" });
    expect(tomorrow.ok && tomorrow.data.items.map(item => item.displayName)).toEqual(["Synthetic doctor 2"]);
  });
  it("paginates with an honest total", async () => {
    const page = await api().search({ showFull: true });
    expect(page.ok && page.data.total).toBe(6);
    expect(page.ok && page.data.hasMore).toBe(6 > DOCTOR_PAGE_SIZE);
  });
  it("suggests doctor and clinic names only, and gets one doctor", async () => {
    const suggestions = await api().suggest("clinic");
    expect(suggestions.ok && suggestions.data.items.every(item => item.group === "clinic")).toBe(true);
    expect(await api().suggest("a")).toEqual(fail("validation"));
    const doctor = await api().get("00000000-0000-4000-8000-000000000101");
    expect(doctor.ok && doctor.data.displayName).toBe("Synthetic doctor 2");
    expect(await api().get("00000000-0000-4000-8000-000000009999")).toEqual(fail("not_found"));
  });
  it("is refused in the browser and gated over HTTP", async () => {
    vi.stubGlobal("window", {});
    expect(() => createDoctorSearchFixtureApi({ env })).toThrow(/server/i);
    vi.unstubAllGlobals();
    const http = createDoctorSearchHttpApi();
    expect(await http.search({})).toEqual(fail("gated"));
    expect(await http.suggest("fever")).toEqual(fail("gated"));
    expect(await http.search({}, { lat: 100, lng: 0, accuracyM: 0 })).toEqual(fail("validation"));
  });
});

describe("taxonomy and geometry helpers", () => {
  it("matches translated speciality and symptom labels", () => {
    const labels = { speciality: (key: string) => key === "paediatrics" ? "Child specialist" : key, symptom: (key: string) => key === "childFever" ? "Fever in a child" : key };
    expect(taxonomySuggestions("child", labels)).toEqual([{ group: "speciality", value: "paediatrics" }, { group: "symptom", value: "childFever" }]);
    expect(taxonomySuggestions("c", labels)).toEqual([]);
  });
  it("formats coordinates and computes distance", () => {
    expect(formatCoordinates({ lat: 17.529412, lng: 78.394588, accuracyM: 136.6 })).toEqual({ coordinates: "17.5294, 78.3946", accuracyM: 137 });
    expect(haversineKm({ lat: 17.385, lng: 78.4867 }, { lat: 17.385, lng: 78.4867 })).toBe(0);
    expect(Math.round(haversineKm({ lat: 17.385, lng: 78.4867 }, { lat: 17.44, lng: 78.3489 }))).toBe(16);
  });
});

describe("booking readiness gate", () => {
  it("is ready only when every server-required item is done", () => {
    const [self, family] = syntheticMembers();
    expect(bookingReadiness(self)).toEqual({ kind: "ready", done: 13, total: 13 });
    expect(bookingReadiness(family)).toEqual({ kind: "incomplete", done: 10, total: 13, missing: ["dateOfBirth", "allergies", "currentMedicines"] });
  });
  it("fails closed for missing lists, invalid records and no booking grant", () => {
    const [self] = syntheticMembers();
    expect(bookingReadiness({ ...self, profile: [] })).toEqual({ kind: "unknown" });
    expect(bookingReadiness({ ...self, profile: syntheticProfile().map(item => ({ ...item, required: false })) })).toEqual({ kind: "unknown" });
    expect(bookingReadiness({ ...self, canBook: false })).toEqual({ kind: "not_permitted" });
    expect(bookingReadiness({ ...self, profile: [...self.profile, self.profile[0]] })).toEqual({ kind: "unknown" });
  });
  it("links identity and health items to separate forms", () => {
    expect(profileItemHref("pin")).toBe("/patient/profile#field-pin");
    expect(profileItemHref("allergies")).toBe("/patient/health-profile#field-allergies");
  });
});

describe("synthetic doctors are bookable end to end in fixture mode", () => {
  it("offers a server price and creates a booking with the same snapshot", async () => {
    const patient = createPatientFixtureApi({ env });
    const offer = await patient.getOffer({ providerId: "00000000-0000-4000-8000-000000000101", serviceId: "00000000-0000-4000-8001-000000000101",
      category: "doctor", pin: "500032", startAt: "2026-11-21T04:30:00.000Z", endAt: "2026-11-21T05:30:00.000Z" });
    expect(offer.ok && offer.data.priceSnapshot.amountPaise).toBe(80000);
    const bookings = createBookingsFixtureApi({ env });
    const created = await bookings.create({ patientId: "00000000-0000-4000-8002-000000000001", serviceId: "00000000-0000-4000-8001-000000000101",
      addressId: "00000000-0000-4000-8003-000000000001", startAt: "2026-11-21T04:30:00.000Z" }, crypto.randomUUID());
    expect(created.ok).toBe(true);
    const row = created.ok ? await bookings.get(created.data.id) : undefined;
    expect(row?.ok && row.data.priceSnapshot.amountPaise).toBe(80000);
    // The location-less synthetic doctor is not bookable: no coverage can be shown for them.
    expect((await bookings.create({ patientId: "00000000-0000-4000-8002-000000000001", serviceId: "00000000-0000-4000-8001-000000000105",
      addressId: "00000000-0000-4000-8003-000000000001", startAt: "2026-11-21T04:30:00.000Z" }, crypto.randomUUID())).ok).toBe(false);
  });
});

describe("server API origin", () => {
  it("prefixes a configured origin and rejects invalid ones", async () => {
    const seen: string[] = [];
    const http = createHttpClient({ baseUrl: "http://localhost:3000/ignored", fetch: async path => { seen.push(String(path)); return Response.json({}); } });
    await http.request("/api/catalog?pin=500001", { safeParse: () => ({ success: true, data: {} }) } as never);
    expect(seen).toEqual(["http://localhost:3000/api/catalog?pin=500001"]);
    expect(() => createHttpClient({ baseUrl: "javascript:alert(1)" })).toThrow();
  });
});

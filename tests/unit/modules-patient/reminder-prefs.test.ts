import { describe, expect, it } from "vitest";
import { createReminderPrefsFixtureApi, defaultReminderPrefs } from "@/modules/reminder-prefs/fixture";
import { createReminderPrefsHttpApi } from "@/modules/reminder-prefs/http";
import { validateReminderPrefs } from "@/modules/reminder-prefs/schemas";
import { enabledChannels, inQuietHours, istMinutes, spansMidnight } from "@/modules/reminder-prefs/status";

const ENV = { FRONTEND_ADAPTER: "fixture", APP_ENV: "test" };
const input = (over: Partial<{ sms: boolean; whatsapp: boolean; email: boolean; enabled: boolean; start: string; end: string }> = {}) => ({
  channels: { sms: over.sms ?? true, whatsapp: over.whatsapp ?? false, email: over.email ?? true },
  quietHours: { enabled: over.enabled ?? true, start: over.start ?? "22:00", end: over.end ?? "06:30" },
});
let n = 0;
const owner = () => `reminder-owner-${Date.now()}-${n++}`;

describe("reminder preference validation", () => {
  it("accepts channel toggles and HH:MM quiet hours, including all channels off", () => {
    expect(validateReminderPrefs(input()).ok).toBe(true);
    expect(validateReminderPrefs(input({ sms: false, email: false })).ok).toBe(true);
  });
  it("checks times only when quiet hours are on", () => {
    expect(validateReminderPrefs(input({ enabled: false, start: "", end: "" })).ok).toBe(true);
    expect(validateReminderPrefs(input({ start: "", end: "25:00" }))).toEqual({ ok: false, issues: [{ field: "quietStart", code: "quiet_start_invalid" }, { field: "quietEnd", code: "quiet_end_invalid" }] });
    expect(validateReminderPrefs(input({ start: "07:00", end: "07:00" }))).toEqual({ ok: false, issues: [{ field: "quietEnd", code: "quiet_same" }] });
  });
  it("rejects unknown channels and malformed bodies", () => {
    expect(validateReminderPrefs({ ...input(), channels: { sms: true, whatsapp: false, email: false, push: true } })).toMatchObject({ ok: false, malformed: true });
    expect(validateReminderPrefs({ channels: { sms: "yes" } })).toMatchObject({ ok: false });
    expect(validateReminderPrefs(null)).toMatchObject({ ok: false });
  });
});

describe("quiet hours in IST", () => {
  const q = { enabled: true, start: "21:00", end: "07:00" };
  it("converts UTC to IST minutes", () => {
    expect(istMinutes(new Date("2026-11-19T18:30:00Z"))).toBe(0); // 00:00 IST
    expect(istMinutes(new Date("2026-11-19T15:29:00Z"))).toBe(20 * 60 + 59);
  });
  it("handles windows that span midnight, end exclusive", () => {
    expect(inQuietHours(q, new Date("2026-11-19T15:30:00Z"))).toBe(true); // 21:00 IST
    expect(inQuietHours(q, new Date("2026-11-19T15:29:00Z"))).toBe(false); // 20:59 IST
    expect(inQuietHours(q, new Date("2026-11-20T01:29:00Z"))).toBe(true); // 06:59 IST
    expect(inQuietHours(q, new Date("2026-11-20T01:30:00Z"))).toBe(false); // 07:00 IST
    expect(spansMidnight(q)).toBe(true);
  });
  it("handles same-day windows and the disabled state", () => {
    const day = { enabled: true, start: "13:00", end: "15:00" };
    expect(inQuietHours(day, new Date("2026-11-19T08:00:00Z"))).toBe(true); // 13:30 IST
    expect(inQuietHours(day, new Date("2026-11-19T10:00:00Z"))).toBe(false); // 15:30 IST
    expect(spansMidnight(day)).toBe(false);
    expect(inQuietHours({ ...q, enabled: false }, new Date("2026-11-19T18:30:00Z"))).toBe(false);
  });
  it("lists enabled channels in a stable order", () => {
    expect(enabledChannels(input({ sms: false, whatsapp: true, email: true }))).toEqual(["whatsapp", "email"]);
  });
});

describe("reminder preferences fixture adapter", () => {
  it("starts from the proposed defaults and refuses signed-out callers", async () => {
    expect(await createReminderPrefsFixtureApi({ env: ENV, ownerId: null }).get()).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
    const r = await createReminderPrefsFixtureApi({ env: ENV, ownerId: owner() }).get();
    expect(r).toEqual({ ok: true, data: defaultReminderPrefs() });
  });
  it("saves with a version check and persists for the owner", async () => {
    const id = owner();
    const api = createReminderPrefsFixtureApi({ env: ENV, ownerId: id });
    const saved = await api.update(input(), 1);
    expect(saved.ok && saved.data.version).toBe(2);
    expect(await api.update(input(), 1)).toMatchObject({ ok: false, error: { code: "conflict" } });
    const again = await createReminderPrefsFixtureApi({ env: ENV, ownerId: id }).get();
    expect(again.ok && again.data.quietHours).toEqual({ enabled: true, start: "22:00", end: "06:30" });
  });
  it("returns field codes on invalid quiet hours", async () => {
    const api = createReminderPrefsFixtureApi({ env: ENV, ownerId: owner() });
    expect(await api.update(input({ start: "9pm" }), 1)).toEqual({ ok: false, error: { code: "validation", fields: { quietStart: "quiet_start_invalid" } } });
    expect(await api.update(input(), 0)).toMatchObject({ ok: false, error: { code: "validation" } });
  });
  it("is refused in production", () => {
    expect(() => createReminderPrefsFixtureApi({ env: { FRONTEND_ADAPTER: "fixture", APP_ENV: "production" }, ownerId: "x" })).toThrow();
  });
});

describe("reminder preferences http adapter", () => {
  it("fails closed as gated", async () => {
    const api = createReminderPrefsHttpApi();
    expect(await api.get()).toEqual({ ok: false, error: { code: "gated" } });
    expect(await api.update(input(), 1)).toEqual({ ok: false, error: { code: "gated" } });
  });
});

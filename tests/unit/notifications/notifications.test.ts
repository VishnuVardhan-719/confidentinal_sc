import { describe, expect, it } from "vitest";
import { DEFAULT_DOCTOR_ACTOR, DEFAULT_PATIENT_ACTOR, NO_ACTOR } from "@/fixtures/clinical/world";
import { getNotificationsApi, notificationSchema, unreadCount } from "@/modules/notifications";
import { createNotificationsFixtureApi, createNotificationsTestStore } from "@/modules/notifications/fixture";
import en from "@/messages/en/patient.json";
import te from "@/messages/te/patient.json";
import hi from "@/messages/hi/patient.json";
import { NOTIFICATION_KINDS } from "@/modules/notifications/types";

const env = { FRONTEND_ADAPTER: "fixture" };
const api = (actor = DEFAULT_PATIENT_ACTOR, store = createNotificationsTestStore(new Date("2026-11-19T10:00:00Z"))) =>
  createNotificationsFixtureApi({ env, actor, store, now: () => new Date("2026-11-19T10:05:00Z") });

describe("notifications fixture adapter", () => {
  it("lists the patient's own notifications newest first, with unread items", async () => {
    const r = await api().listMine();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const times = r.data.map((n) => n.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect(unreadCount(r.data)).toBe(2);
    for (const n of r.data) expect(notificationSchema.safeParse(n).success).toBe(true);
  });

  it("denies doctors and anonymous actors", async () => {
    expect((await api(DEFAULT_DOCTOR_ACTOR).listMine()).ok).toBe(false);
    const r = await api(NO_ACTOR).markRead({ ids: ["syn-ntf-004"] });
    expect(r).toEqual({ ok: false, error: { code: "forbidden" } });
  });

  it("marks only the given unread items read, once", async () => {
    const store = createNotificationsTestStore(new Date("2026-11-19T10:00:00Z"));
    const a = api(DEFAULT_PATIENT_ACTOR, store);
    expect(await a.markRead({ ids: ["syn-ntf-004", "syn-ntf-002"] })).toEqual({ ok: true, data: { updated: 1 } });
    expect(await a.markRead({ ids: ["syn-ntf-004"] })).toEqual({ ok: true, data: { updated: 0 } });
    const r = await a.listMine();
    expect(r.ok && unreadCount(r.data)).toBe(1);
  });

  it("rejects an empty mark-read request", async () => {
    expect(await api().markRead({ ids: [] })).toEqual({ ok: false, error: { code: "validation" } });
  });

  it("refuses fixture data in production", () => {
    expect(() => getNotificationsApi({ FRONTEND_ADAPTER: "fixture", APP_ENV: "production" })).toThrow();
  });

  it("http adapter reports not connected (gated) instead of guessing an endpoint", async () => {
    expect(await getNotificationsApi({}).listMine()).toEqual({ ok: false, error: { code: "gated" } });
  });

  it("schema only allows in-app patient paths, never external links", () => {
    const base = { id: "x", kind: "record_ready", createdAt: "2026-11-19T10:00:00Z", readAt: null, bookingReference: null };
    expect(notificationSchema.safeParse({ ...base, href: "/patient/records/abc-1" }).success).toBe(true);
    expect(notificationSchema.safeParse({ ...base, href: "https://evil.example/x" }).success).toBe(false);
    expect(notificationSchema.safeParse({ ...base, href: "//evil.example" }).success).toBe(false);
    expect(notificationSchema.safeParse({ ...base, href: null, body: "free text" }).success).toBe(false);
  });

  it("every kind has title/body/action in en, te and hi", () => {
    for (const m of [en, te, hi]) {
      for (const k of NOTIFICATION_KINDS) {
        const entry = (m.notifications.kind as Record<string, { title: string; body: string; action: string }>)[k];
        expect(entry?.title, k).toBeTruthy();
        expect(entry?.body, k).toContain("{reference}");
        expect(entry?.action, k).toBeTruthy();
      }
    }
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderExternal, renderInbox } from "@/lib/notifications/render";
import { en } from "@/lib/notifications/templates/en";
import { te } from "@/lib/notifications/templates/te";
import { hi } from "@/lib/notifications/templates/hi";
import { notificationEnv } from "@/lib/notifications/config";
import { dispatchNotifications, cronAuthorized } from "@/lib/notifications/dispatch";
import { logAdapter } from "@/lib/notifications/adapters/log";
import { isEnabled } from "@/lib/feature-flags";
import { parseServerEnv } from "@/lib/env";

const id = "10000000-0000-4000-8000-000000000001";
const ref = "SCV-000000000001";
const origin = "https://surecurevisit.in";
const link = `${origin}/en/patient`;
afterEach(() => vi.restoreAllMocks());
describe("N01 content and gates", () => {
  it("has every key in all locales, with unreviewed translations falling back to English", () => {
    expect(Object.keys(te)).toEqual(Object.keys(en));
    expect(Object.keys(hi)).toEqual(Object.keys(en));
    expect(Object.values(te).every(v => !v.reviewed)).toBe(true);
    expect(renderInbox("booking.confirmed", "te", {})).toBe(en["booking.confirmed"].text);
  });
  it("renders content-free external templates with bounded placeholders and no clinical/ETA/payment claims", () => {
    for (const [key, v] of Object.entries(en).filter(([key]) => key.startsWith("ext."))) {
      expect([...v.text.matchAll(/\{([^}]+)\}/g)].map(x => x[1]).every(x => ["ref", "link"].includes(x))).toBe(true);
      const text = renderExternal(key, "en", { ref, link }, origin);
      expect(text.length).toBeLessThanOrEqual(160);
      expect(text).not.toMatch(/medicine|medication|diagnos|prescri|treatment|symptom|\btest\b|sample|report|result|ready|\bETA\b|minutes away|arriving in|on the way|\bpaid\b|payment successful|refund/i);
      expect(text.includes("In an emergency call 112")).toBe(key === "ext.not_going_ahead");
    }
  });
  it("rejects extra params, forged refs, unsafe links and unreviewed external copy", () => {
    for (const params of [{ ref: "SCV-1", link }, { ref, link, name: "Synthetic" }, { ref, link: "https://evil.invalid/en/patient" }, { ref, link: `${link}?token=x` }, { ref, link: `${link}#x` }, { ref, link: `${origin}/en/../api/private` }]) {
      expect(() => renderExternal("ext.booking_update", "en", params, origin)).toThrow();
    }
    expect(() => renderExternal("ext.booking_update", "te", { ref, link }, origin)).toThrow();
  });
  it("keeps flags exact and rejects unapproved channels/adapters or translations", () => {
    expect(isEnabled("notifySms", {})).toBe(false);
    expect(isEnabled("notifySms", { FEATURE_NOTIFY_SMS: "TRUE" })).toBe(false);
    expect(notificationEnv({})).toEqual({ channels: [] });
    for (const source of [
      { FEATURE_NOTIFY_SMS: "true" }, { FEATURE_NOTIFY_SMS: "true", NOTIFY_SMS_ADAPTER: "vendor" },
      { FEATURE_NOTIFY_SMS: "true", NOTIFY_SMS_ADAPTER: "log" }, { FEATURE_NOTIFY_WHATSAPP: "true", NOTIFY_WHATSAPP_ADAPTER: "log" },
    ]) expect(() => notificationEnv(source)).toThrow();
    expect(() => parseServerEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic", FEATURE_NOTIFY_SMS: "true", NOTIFY_SMS_ADAPTER: "log" })).toThrow();
  });
});
describe("N01 dispatcher", () => {
  const claim = { delivery_id: id, attempt_no: 1, channel: "sms", locale: "en", template_key: "ext.booking_update", template_version: 1,
    params: { public_ref: ref, locale: "en" }, destination: "19999990001" };
  it("claims, sends and completes; logs never carry destinations or rendered text", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const rpc = vi.fn().mockResolvedValueOnce({ data: [claim], error: null }).mockResolvedValueOnce({ data: null, error: null });
    const result = await dispatchNotifications({ rpc }, ["sms"], origin);
    expect(result).toEqual({ claimed: 1, accepted: 1, failed: 0 });
    expect(rpc.mock.calls.map(c => c[0])).toEqual(["claim", "complete"]);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_delivery_id: id, p_attempt_no: 1, p_outcome: "accepted", p_vendor_ref: `log:${id}` });
    expect(JSON.stringify(spy.mock.calls)).not.toContain(claim.destination);
    expect(JSON.stringify(spy.mock.calls)).not.toContain("has an update");
  });
  it("does not claim disabled channels", async () => {
    const rpc = vi.fn();
    expect(await dispatchNotifications({ rpc }, [], origin)).toEqual({ claimed: 0, accepted: 0, failed: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("starts the leased batch concurrently so slow sends do not consume another row's lease", async () => {
    const other = { ...claim, delivery_id: "20000000-0000-4000-8000-000000000002" };
    const rpc = vi.fn().mockResolvedValueOnce({ data: [claim, other], error: null }).mockResolvedValue({ data: null, error: null });
    let releaseFirst: (() => void) | undefined;
    const firstReady = new Promise<void>(resolve => { releaseFirst = resolve; });
    const result = await dispatchNotifications({ rpc }, ["sms"], origin, {
      timeoutMs: 20,
      adapter: () => ({ ...logAdapter("sms"), send: async message => {
        if (message.deliveryId === id) await firstReady;
        else releaseFirst?.();
        return { kind: "accepted", vendorRef: `log:${message.deliveryId}` };
      } }),
    });
    expect(result).toEqual({ claimed: 2, accepted: 2, failed: 0 });
  });
  it("maps thrown adapter errors and enforces an abort timeout", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [claim], error: null }).mockResolvedValue({ data: null, error: null });
    await dispatchNotifications({ rpc }, ["sms"], origin, { adapter: () => ({ ...logAdapter("sms"), send: async () => { throw new Error("private vendor response"); } }) });
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_outcome: "retryable", p_error_code: "network" });
    rpc.mockClear().mockResolvedValueOnce({ data: [claim], error: null }).mockResolvedValue({ data: null, error: null });
    await dispatchNotifications({ rpc }, ["sms"], origin, { timeoutMs: 1, adapter: () => ({ ...logAdapter("sms"), send: async () => new Promise(() => {}) }) });
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_outcome: "retryable", p_error_code: "timeout" });
  });
  it("rejects unauthenticated cron calls, including unset secrets", () => {
    for (const h of [null, "Bearer wrong", "Bearer "]) expect(cronAuthorized(h, "synthetic-secret")).toBe(false);
    expect(cronAuthorized("Bearer synthetic-secret", undefined)).toBe(false);
    expect(cronAuthorized("Bearer synthetic-secret", "synthetic-secret")).toBe(true);
  });
});

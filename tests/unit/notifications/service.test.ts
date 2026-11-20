import { describe, expect, it, vi } from "vitest";
import { notificationCommand } from "@/lib/notifications/service";
import { inboxPageSchema, readSchema, preferenceSchema } from "@/lib/notifications/schemas";

const id = "10000000-0000-4000-8000-000000000001";
describe("N01 user boundary", () => {
  it.each([
    ["mark_notifications_read", { p_ids: [id] as string[] }, 1],
    ["mark_all_notifications_read", { p_before: "2026-11-20T01:00:00Z" }, 0],
    ["set_notification_preference", { p_channel: "sms", p_topic: "booking", p_enabled: true, p_notice_version: "v1", p_expected_version: 0 }, 1],
    ["list_notification_failures", { p_limit: 50, p_after: null }, []],
  ] as const)("calls %s using the exact contract", async (name, args, result) => {
    const rpc = vi.fn().mockResolvedValue({ data: result, error: null });
    expect(await notificationCommand({ rpc }, name, args)).toEqual(result);
    expect(rpc).toHaveBeenCalledExactlyOnceWith(name, args);
  });
  it.each([
    ["42501", "private data", 404, "not_found"], ["P0002", "private data", 404, "not_found"],
    ["55000", "feature_unavailable", 404, "feature_unavailable"], ["55000", "feature_suspended", 503, "notifications_unavailable"],
    ["40001", "stale_version", 409, "conflict"], ["53300", "rate_limited", 429, "rate_limited"],
    ["22023", "invalid_input", 422, "invalid_input"], ["XX000", "private data", 503, "notifications_unavailable"],
  ])("sanitizes %s/%s without retries", async (code, message, status, errorCode) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code, message } });
    await expect(notificationCommand({ rpc }, "mark_notifications_read", { p_ids: [id] })).rejects.toMatchObject({ status, code: errorCode });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects injected authority, malformed lists and transport failures", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("private transport text"));
    await expect(notificationCommand({ rpc }, "mark_notifications_read", { p_ids: [id], actor: id } as never)).rejects.toMatchObject({ status: 422 });
    expect(rpc).not.toHaveBeenCalled();
    await expect(notificationCommand({ rpc }, "mark_notifications_read", { p_ids: [id] })).rejects.toMatchObject({ status: 503 });
    rpc.mockResolvedValue({ data: [{ destination: "private" }], error: null });
    await expect(notificationCommand({ rpc }, "list_notification_failures", { p_limit: 50, p_after: null })).rejects.toMatchObject({ status: 503 });
  });
  it("validates read alternatives, limits, consent notice and complete cursors", () => {
    expect(readSchema.safeParse({ ids: [id] }).success).toBe(true);
    for (const body of [{ ids: [] }, { ids: Array(101).fill(id) }, { ids: [id], before: "2026-11-20T00:00:00Z" }, { all: true }, { ids: [id], actor: id }]) {
      expect(readSchema.safeParse(body).success).toBe(false);
    }
    expect(inboxPageSchema.safeParse({ before: "2026-11-20T00:00:00Z" }).success).toBe(false);
    expect(inboxPageSchema.safeParse({ before: "2026-11-20T00:00:00Z", beforeId: id }).success).toBe(true);
    expect(preferenceSchema.safeParse({ channel: "sms", topic: "booking", enabled: true, noticeVersion: " ", expectedVersion: 0 }).success).toBe(false);
  });
});

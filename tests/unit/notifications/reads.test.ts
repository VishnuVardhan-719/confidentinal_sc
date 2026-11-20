import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { inbox, preferences, unreadCount } from "@/lib/notifications/service";

const id = "10000000-0000-4000-8000-000000000001";
const date = "2026-11-20T00:00:00+00:00";
const row = { id, template_key: "booking.confirmed", template_version: 1, priority: "transactional", booking_id: id,
  params: { public_ref: "SCV-000000000001" }, created_at: date, read_at: null };
function database(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "order", "limit", "or", "is"]) builder[method] = vi.fn(() => builder);
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  const from = vi.fn(() => builder);
  return { db: { from } as unknown as Pick<SupabaseClient, "from">, from, builder };
}
describe("N01 recipient-only table reads", () => {
  it("uses a timestamp plus UUID cursor, stable ordering and a fixed 20-row limit", async () => {
    const { db, from, builder } = database({ data: Array(20).fill(row), error: null });
    const result = await inbox(db, { before: date, beforeId: id });
    expect(from).toHaveBeenCalledExactlyOnceWith("notifications");
    expect(builder.limit).toHaveBeenCalledWith(20);
    expect(builder.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(builder.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
    expect(builder.or).toHaveBeenCalledWith(`created_at.lt.${date},and(created_at.eq.${date},id.lt.${id})`);
    expect(result.nextCursor).toEqual({ before: date, beforeId: id });
  });
  it("omits a cursor on the last page and rejects injected database fields", async () => {
    const { db } = database({ data: [row], error: null });
    expect((await inbox(db, {})).nextCursor).toBeNull();
    const corrupt = database({ data: [{ ...row, destination: "private" }], error: null });
    await expect(inbox(corrupt.db, {})).rejects.toMatchObject({ status: 503 });
  });
  it("counts unread rows without fetching bodies, and leaves missing preferences off", async () => {
    const { db, builder } = database({ count: 7, error: null });
    expect(await unreadCount(db)).toBe(7);
    expect(builder.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(builder.is).toHaveBeenCalledWith("read_at", null);
    expect(await preferences(database({ data: [], error: null }).db)).toEqual([]);
  });
  it("does not build filters from malformed cursors or return upstream errors", async () => {
    const { db, from } = database({ data: null, error: { code: "XX000", message: "private payload" } });
    await expect(inbox(db, { before: "2026-11-20,or=all", beforeId: id })).rejects.toMatchObject({ status: 422 });
    expect(from).not.toHaveBeenCalled();
    await expect(inbox(db, {})).rejects.toMatchObject({ status: 503, code: "notifications_unavailable" });
  });
});

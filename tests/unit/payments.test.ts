import { describe, expect, it, vi } from "vitest";
import { isEnabled } from "@/lib/feature-flags";
import { paymentCommand } from "@/lib/payments/service";
import { rpcSchemas } from "@/lib/validation/payments";

describe("P01 environment gates", () => {
  it("registers exact, default-off payment flags", () => {
    expect(isEnabled("payAfter", {})).toBe(false);
    expect(isEnabled("payAfter", { FEATURE_PAY_AFTER: "true" })).toBe(true);
    expect(isEnabled("payAfter", { FEATURE_PAY_AFTER: "TRUE" })).toBe(false);
  });
});

const id = "10000000-0000-4000-8000-000000000001";
const report = { p_booking_id: id, p_amount_paise: "12345", p_method: "cash", p_reference: null, p_request_key: id } as const;
describe("P01 RPC boundary", () => {
  it("preserves integer paise strings and exact RPC arguments", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: id, error: null });
    expect(await paymentCommand({ rpc }, "report_collection", report)).toBe(id);
    expect(rpc).toHaveBeenCalledWith("report_collection", report);
  });
  it.each([0, "0", "-1", "1.5", "01", "1000000000000000", "1e3"])("rejects invalid claim amount %s", async amount => {
    const rpc = vi.fn();
    await expect(paymentCommand({ rpc }, "report_collection", { ...report, p_amount_paise: amount } as never)).rejects.toMatchObject({ status: 422 });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("enforces cash/UPI references and rejects injected authority", () => {
    for (const extra of [{ p_reference: "123456789012" }, { actor: id }, { paid: true }]) {
      expect(rpcSchemas.report_collection.safeParse({ ...report, ...extra }).success).toBe(false);
    }
    for (const reference of ["4111-1111-1111-1111", "4111111111111111", "9999999999", "１２３４５６７８９０１２"]) {
      expect(rpcSchemas.report_collection.safeParse({ ...report, p_method: "upi_direct", p_reference: reference }).success).toBe(false);
    }
    expect(rpcSchemas.report_collection.safeParse({ ...report, p_method: "upi_direct", p_reference: "123456789012" }).success).toBe(true);
  });
  it.each([
    ["28000", "private detail", 401, "unauthenticated"],
    ["42501", "private detail", 404, "not_found"],
    ["P0002", "private detail", 404, "not_found"],
    ["55000", "feature_unavailable", 404, "feature_unavailable"],
    ["55000", "dispute_limit", 409, "conflict"],
    ["22023", "over_collection", 409, "conflict"],
    ["22023", "invalid_input", 422, "invalid_input"],
    ["40001", "stale_version", 409, "conflict"],
    ["40001", "idempotency_conflict", 409, "conflict"],
    ["unknown", "private detail", 503, "payments_unavailable"],
  ])("sanitizes %s/%s and never retries", async (code, message, status, expected) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code, message } });
    await expect(paymentCommand({ rpc }, "report_collection", report)).rejects.toMatchObject({ status, code: expected });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects missing keys, invalid versions and split pagination", () => {
    expect(rpcSchemas.report_collection.safeParse({ ...report, p_request_key: undefined }).success).toBe(false);
    expect(rpcSchemas.void_collection.safeParse({ p_collection_id: id, p_expected_payment_version: 0, p_reason_code: "other", p_request_key: id }).success).toBe(false);
    expect(rpcSchemas.list_payment_queue.safeParse({ p_limit: 10, p_after_id: id, p_after_reported_at: null }).success).toBe(false);
  });
  it("serializes bigint money while refusing lossy database results", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { amountPaise: BigInt("999999999999999"), confirmedPaise: 0 }, error: null });
    expect(await paymentCommand({ rpc }, "get_payment_summary", { p_booking_id: id })).toEqual({ amountPaise: "999999999999999", confirmedPaise: "0" });
    rpc.mockResolvedValue({ data: { amountPaise: Number.MAX_SAFE_INTEGER + 1 }, error: null });
    await expect(paymentCommand({ rpc }, "get_payment_summary", { p_booking_id: id })).rejects.toMatchObject({ status: 503 });
  });
  it("sanitizes a thrown transport failure without retry", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("private upstream details"));
    await expect(paymentCommand({ rpc }, "report_collection", report)).rejects.toMatchObject({ status: 503, code: "payments_unavailable" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

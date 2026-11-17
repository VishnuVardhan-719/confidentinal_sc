import { beforeEach, describe, expect, it, vi } from "vitest";
import { IdentityError } from "@/lib/auth/identity";
const mock = vi.hoisted(() => ({ session: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth/http", async original => ({ ...await original<typeof import("@/lib/auth/http")>(), session: mock.session }));
import { POST as create } from "@/app/api/providers/route";
import { POST as review } from "@/app/api/admin/providers/[id]/review/route";
import { POST as submit } from "@/app/api/providers/[id]/submit/route";
import { POST as document } from "@/app/api/providers/[id]/documents/route";
import { PATCH as patch } from "@/app/api/providers/[id]/route";
import { providerCommand, signedDocumentUrl } from "@/lib/providers/service";

const id = "10000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ id }) };
const request = (body: unknown) => new Request("http://localhost/api/providers", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); mock.session.mockResolvedValue({ db: { rpc: mock.rpc } }); mock.rpc.mockResolvedValue({ data: id, error: null }); });
describe("provider HTTP commands", () => {
  it("requires authentication before any command", async () => {
    mock.session.mockRejectedValue(new IdentityError(401, "unauthenticated"));
    expect((await create(request({ category: "doctor", displayName: "Synthetic" }))).status).toBe(401);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("derives ownership in DB and rejects injected authority", async () => {
    expect((await create(request({ category: "doctor", displayName: "Synthetic", status: "approved" }))).status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
    expect((await create(request({ category: "doctor", displayName: "Synthetic" }))).status).toBe(201);
    expect(mock.rpc).toHaveBeenCalledWith("create_provider", { p_category: "doctor", p_display_name: "Synthetic", p_description: "", p_organization_id: null });
  });
  it("rejects bad IDs and missing versions", async () => {
    expect((await submit(request({ expectedVersion: 1 }), { params: Promise.resolve({ id: "bad" }) })).status).toBe(422);
    expect((await patch(request({ displayName: "Synthetic" }), context)).status).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("submits only the ID and optimistic version", async () => {
    expect((await submit(request({ expectedVersion: 4 }), context)).status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("submit_provider", { p_provider_id: id, p_expected_version: 4 });
  });
  it("returns a private validation error when submission has no provider profile", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "provider_profile_required" } });
    const response = await submit(request({ expectedVersion: 2 }), context);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: { code: "invalid_input" } });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(mock.rpc).toHaveBeenCalledWith("submit_provider", { p_provider_id: id, p_expected_version: 2 });
  });
  it("reserves metadata without accepting filenames", async () => {
    mock.rpc.mockResolvedValue({ data: { document: { id }, provider_version: 17 }, error: null });
    const result = await document(request({ kind: "registration", contentType: "application/pdf", expiresAt: "2030-01-01T00:00:00Z", expectedVersion: 2 }), context);
    expect(result.status).toBe(201);
    const body = await result.json();
    expect(body.providerVersion).toBe(17);
    expect(body.document).toEqual({ id });
    expect(mock.rpc).toHaveBeenCalledWith("add_provider_document", expect.objectContaining({ p_provider_id: id, p_expected_version: 2 }));
  });
  it.each([["42501", 403], ["40001", 409], ["23514", 422]])("propagates review failure %s safely", async (code, status) => {
    mock.rpc.mockResolvedValue({ error: { code, message: "private detail" } });
    const result = await review(request({ decision: "approved", reason: "Synthetic evidence checked", expectedVersion: 3 }), context);
    expect(result.status).toBe(status);
    expect(await result.text()).not.toContain("private detail");
    expect(result.headers.get("cache-control")).toBe("private, no-store");
  });
  it("forwards review reason and decision to the DB gate", async () => {
    expect((await review(request({ decision: "under_review", reason: "Review started", expectedVersion: 2 }), context)).status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("review_provider", { p_provider_id: id, p_decision: "under_review", p_reason: "Review started", p_expected_version: 2 });
  });
  it("sanitizes unexpected database errors", async () => {
    mock.rpc.mockResolvedValue({ error: { code: "XX000", message: "private" } });
    await expect(providerCommand({ rpc: mock.rpc }, "submit_provider", {})).rejects.toMatchObject({ status: 503, code: "provider_unavailable" });
  });
});

describe("signed document access", () => {
  function client(data: unknown) {
    const maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
    const eq = vi.fn().mockReturnThis();
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://example.invalid/signed" }, error: null });
    return { db: { from: vi.fn(() => ({ select: vi.fn(() => ({ eq, maybeSingle })) })), storage: { from: vi.fn(() => ({ createSignedUrl })) }, rpc: mock.rpc }, createSignedUrl };
  }
  it("does not issue a URL when RLS hides metadata", async () => {
    const { db, createSignedUrl } = client(null);
    await expect(signedDocumentUrl(db as never, id, id)).rejects.toMatchObject({ status: 404 });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
  it("fails closed until a globally bounded signing design exists", async () => {
    const { db, createSignedUrl } = client({ bucket_id: "provider-verification", object_name: `${id}/${id}.pdf` });
    await expect(signedDocumentUrl(db as never, id, id)).rejects.toMatchObject({ status: 503, code: "provider_signed_urls_unavailable" });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});

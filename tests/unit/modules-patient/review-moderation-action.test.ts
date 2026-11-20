/**
 * R9-P4 finding P3: decideReviewAction validates its own arguments (zod) before it looks up the
 * session or calls the adapter, then re-checks the principal and capability.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminPrincipal } from "@/modules/admin/capabilities";

const session = vi.hoisted(() => ({ admin: null as AdminPrincipal | null, calls: 0 }));
const decide = vi.hoisted(() => vi.fn());
const factory = vi.hoisted(() => vi.fn());

vi.mock("@/modules/admin/session", () => ({
  getOperationsSession: async () => {
    session.calls += 1;
    return { guard: null, admin: session.admin };
  },
}));
vi.mock("@/modules/reviews", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/reviews")>();
  return {
    ...actual,
    getReviewModerationApi: (...args: unknown[]) => {
      factory(...args);
      return { decide, listQueue: vi.fn(), listDecisions: vi.fn() };
    },
  };
});

const { decideReviewAction } = await import("@/app/[locale]/admin/reviews/actions");

const ID = "00000000-0000-4000-8000-0000000003b1";
const grant = (capability: "review:moderate" | "provider:verify") => ({ capability, scope: { kind: "global" as const }, grantedAt: "2026-11-01T00:00:00.000Z", expiresAt: null, revokedAt: null });
const moderator: AdminPrincipal = { profileId: "fx-adm-super", status: "active", mfaVerified: true, grants: [grant("review:moderate")] };
const verifier: AdminPrincipal = { profileId: "fx-adm-verifier", status: "active", mfaVerified: true, grants: [grant("provider:verify")] };

beforeEach(() => {
  session.admin = moderator;
  session.calls = 0;
  decide.mockReset();
  factory.mockReset();
  decide.mockResolvedValue({ ok: true, data: { reviewId: ID } });
});

describe("decideReviewAction input validation", () => {
  it.each([
    ["not-a-uuid", 1],
    ["", 1],
    [`${ID}x`, 1],
    ["../00000000-0000-4000-8000-0000000003b1", 1],
    [123 as unknown as string, 1],
    [null as unknown as string, 1],
  ])("refuses review id %j without touching the session or adapter", async (id, version) => {
    expect(await decideReviewAction(id, { decision: "publish" }, version)).toEqual({ ok: false, error: { code: "validation" } });
    expect(session.calls).toBe(0);
    expect(decide).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "1" as unknown as number, null as unknown as number])(
    "refuses expected version %j",
    async (version) => {
      expect(await decideReviewAction(ID, { decision: "publish" }, version)).toEqual({ ok: false, error: { code: "validation" } });
      expect(session.calls).toBe(0);
      expect(decide).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, {}, { decision: "reject" }, { decision: "reject", reason: "free text" }, { decision: "publish", extra: 1 }, "publish"])(
    "refuses decision %j",
    async (decision) => {
      expect(await decideReviewAction(ID, decision, 1)).toEqual({ ok: false, error: { code: "validation" } });
      expect(decide).not.toHaveBeenCalled();
    },
  );
});

describe("decideReviewAction authorization", () => {
  it("signed out -> unauthenticated; without review:moderate -> forbidden; adapter not called", async () => {
    session.admin = null;
    expect(await decideReviewAction(ID, { decision: "publish" }, 1)).toEqual({ ok: false, error: { code: "unauthenticated" } });
    session.admin = verifier;
    expect(await decideReviewAction(ID, { decision: "publish" }, 1)).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(decide).not.toHaveBeenCalled();
  });

  it("valid input from a moderator reaches the adapter with parsed values and the moderator as actor", async () => {
    const upper = ID.toUpperCase();
    expect(await decideReviewAction(upper, { decision: "reject", reason: "spam" }, 3)).toMatchObject({ ok: true });
    expect(decide).toHaveBeenCalledWith(ID, { decision: "reject", reason: "spam" }, 3);
    expect(factory).toHaveBeenCalledWith(expect.anything(), true, "fx-adm-super");
  });

  it("an adapter exception becomes unavailable", async () => {
    decide.mockRejectedValueOnce(new Error("boom"));
    expect(await decideReviewAction(ID, { decision: "publish" }, 1)).toEqual({ ok: false, error: { code: "unavailable" } });
  });
});

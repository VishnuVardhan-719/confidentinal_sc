import { describe, expect, it } from "vitest";
import { ageOn, isCalendarDate, todayIst, validateFamilyInput } from "@/modules/family-members/schemas";
import { createFamilyMembersFixtureApi, SYNTHETIC_FAMILY_MEMBER_ID } from "@/modules/family-members/fixture";
import { createFamilyMembersHttpApi } from "@/modules/family-members/http";
import { MAX_FAMILY_MEMBERS } from "@/modules/family-members/types";

const ENV = { FRONTEND_ADAPTER: "fixture", APP_ENV: "test" };
const TODAY = "2026-11-19";
const valid = { displayName: "  Synthetic   Child ", relation: "child", dateOfBirth: "2019-06-01" };
let n = 0;
const owner = () => `test-owner-${Date.now()}-${n++}`;

describe("family member validation", () => {
  it("trims and collapses the name and accepts Telugu/Hindi letters with combining marks", () => {
    const r = validateFamilyInput(valid, TODAY);
    expect(r).toEqual({ ok: true, data: { displayName: "Synthetic Child", relation: "child", dateOfBirth: "2019-06-01" } });
    expect(validateFamilyInput({ ...valid, displayName: "సింథటిక్ బిడ్డ" }, TODAY).ok).toBe(true);
    expect(validateFamilyInput({ ...valid, displayName: "कृत्रिम बच्चा" }, TODAY).ok).toBe(true);
  });

  it("returns one stable code per field, in form order", () => {
    const r = validateFamilyInput({ displayName: " ", relation: "", dateOfBirth: "" }, TODAY);
    expect(r).toEqual({ ok: false, issues: [
      { field: "displayName", code: "name_required" },
      { field: "relation", code: "relation_required" },
      { field: "dateOfBirth", code: "dob_required" },
    ] });
  });

  it("rejects bad names, impossible, future and very old dates", () => {
    const code = (input: object) => { const r = validateFamilyInput({ ...valid, ...input }, TODAY); return r.ok ? null : r.issues[0].code; };
    expect(code({ displayName: "x".repeat(81) })).toBe("name_too_long");
    expect(code({ displayName: "1234" })).toBe("name_invalid");
    expect(code({ displayName: "<script>" })).toBe("name_invalid");
    expect(code({ dateOfBirth: "2026-02-30" })).toBe("dob_invalid");
    expect(code({ dateOfBirth: "19-06-2019" })).toBe("dob_invalid");
    expect(code({ dateOfBirth: "2026-11-20" })).toBe("dob_future");
    expect(code({ dateOfBirth: "1900-01-01" })).toBe("dob_too_old");
    expect(code({ relation: "boss" })).toBe("relation_required");
  });

  it("rejects unknown keys and non-objects", () => {
    expect(validateFamilyInput({ ...valid, bloodGroup: "O+" }, TODAY).ok).toBe(false);
    expect(validateFamilyInput("nope", TODAY).ok).toBe(false);
  });

  it("computes IST today, calendar dates and age", () => {
    // 2026-11-18T20:00Z is already 19 Nov in India.
    expect(todayIst(new Date("2026-11-18T20:00:00Z"))).toBe("2026-11-19");
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("2025-02-29")).toBe(false);
    expect(ageOn("2019-11-20", TODAY)).toBe(6);
    expect(ageOn("2019-11-19", TODAY)).toBe(7);
  });
});

describe("family members fixture adapter", () => {
  it("refuses signed-out callers", async () => {
    const api = createFamilyMembersFixtureApi({ env: ENV, ownerId: null });
    expect((await api.list()).ok).toBe(false);
    expect(await api.create(valid, "key-12345678")).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
  });

  it("seeds one synthetic member, or none in the empty scenario", async () => {
    const seeded = await createFamilyMembersFixtureApi({ env: ENV, ownerId: owner() }).list();
    expect(seeded.ok && seeded.data.map((m) => m.id)).toEqual([SYNTHETIC_FAMILY_MEMBER_ID]);
    const empty = await createFamilyMembersFixtureApi({ env: ENV, ownerId: owner(), scenario: "empty" }).list();
    expect(empty.ok && empty.data).toEqual([]);
  });

  it("creates idempotently and persists across adapter instances for the same owner", async () => {
    const id = owner();
    const a = createFamilyMembersFixtureApi({ env: ENV, ownerId: id, scenario: "empty" });
    const first = await a.create(valid, "key-abcdefgh");
    const retry = await a.create(valid, "key-abcdefgh");
    expect(first.ok && retry.ok && first.data.id === retry.data.id).toBe(true);
    const b = createFamilyMembersFixtureApi({ env: ENV, ownerId: id, scenario: "empty" });
    const list = await b.list();
    expect(list.ok && list.data).toHaveLength(1);
    // Another owner never sees it.
    const other = await createFamilyMembersFixtureApi({ env: ENV, ownerId: owner(), scenario: "empty" }).get(first.ok ? first.data.id : "");
    expect(other).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("returns field codes on validation failure", async () => {
    const api = createFamilyMembersFixtureApi({ env: ENV, ownerId: owner(), scenario: "empty" });
    expect(await api.create({ ...valid, dateOfBirth: "2999-01-01" }, "key-12345678")).toEqual({ ok: false, error: { code: "validation", fields: { dateOfBirth: "dob_future" } } });
  });

  it("updates and removes with version checks", async () => {
    const api = createFamilyMembersFixtureApi({ env: ENV, ownerId: owner() });
    const id = SYNTHETIC_FAMILY_MEMBER_ID;
    expect(await api.update(id, valid, 9)).toMatchObject({ ok: false, error: { code: "conflict" } });
    const u = await api.update(id, { ...valid, relation: "parent" }, 1);
    expect(u.ok && u.data.version).toBe(2);
    expect(await api.remove(id, 1)).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(await api.remove(id, 2)).toEqual({ ok: true, data: { id } });
    expect(await api.get(id)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await api.get("not-a-uuid")).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("enforces the member limit", async () => {
    const api = createFamilyMembersFixtureApi({ env: ENV, ownerId: owner(), scenario: "empty" });
    for (let i = 0; i < MAX_FAMILY_MEMBERS; i++) expect((await api.create(valid, `key-limit-${i}`)).ok).toBe(true);
    expect(await api.create(valid, "key-limit-x")).toMatchObject({ ok: false, error: { code: "conflict" } });
  });

  it("is refused in production", () => {
    expect(() => createFamilyMembersFixtureApi({ env: { FRONTEND_ADAPTER: "fixture", APP_ENV: "production" }, ownerId: "x" })).toThrow();
  });
});

describe("family members http adapter", () => {
  it("fails closed as gated with no network calls", async () => {
    const api = createFamilyMembersHttpApi();
    for (const r of [await api.list(), await api.get("x"), await api.create(valid, "k"), await api.update("x", valid, 1), await api.remove("x", 1)]) {
      expect(r).toEqual({ ok: false, error: { code: "gated" } });
    }
  });
});

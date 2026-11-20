import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EVIDENCE_KINDS, FACT_KINDS, FACT_OUTCOMES, PHOTO_PURPOSES, PHOTO_TYPES, factVerifySchema, proofVerifySchema } from "@/lib/validation/doctor-extras";

const migration = (name: string) => readFileSync(path.join(import.meta.dirname, "../../supabase/migrations", name), "utf8");
const facts = migration("20261117002420_dcx_fact_review.sql");
const photos = migration("20261117002440_dcx_photo_consent.sql");
const all = ["20261117002400_dcx_foundation.sql", "20261117002410_dcx_progress_payment.sql", "20261117002420_dcx_fact_review.sql",
  "20261117002430_dcx_visit_proof.sql", "20261117002440_dcx_photo_consent.sql", "20261117002450_dcx_reports.sql"].map(n => [n, migration(n)] as const);
const list = (values: readonly string[]) => values.map(v => `'${v}'`).join(",");

describe("TS enums equal the SQL CHECKs", () => {
  it.each([
    ["fact kinds", facts, `kind in (${list(FACT_KINDS)})`],
    ["outcomes", facts, `outcome in (${list(FACT_OUTCOMES)})`],
    ["evidence kinds", facts, `evidence_kind in (${list(EVIDENCE_KINDS)})`],
    ["photo purposes", photos, `purpose in (${list(PHOTO_PURPOSES)})`],
    ["photo types", photos, `content_type in (${list(PHOTO_TYPES)})`],
  ])("%s", (_, sql, clause) => { expect(sql).toContain(clause); });
  it("evidence reference and proof token patterns match the database", () => {
    expect(facts).toContain("evidence_ref ~ '^[A-Za-z0-9._:/-]{1,80}$'");
    expect(migration("20261117002430_dcx_visit_proof.sql")).toContain("p_token !~ '^[A-Za-z0-9_-]{43}$'");
    expect(factVerifySchema.shape.evidenceRef.safeParse("REC:2026/11-a_b.c").success).toBe(true);
    expect(proofVerifySchema.safeParse({ token: "a".repeat(43) }).success).toBe(true);
  });
});

describe("migration hygiene (static; DB NOT EXECUTED)", () => {
  it.each(all)("%s is marked DB NOT EXECUTED and runs in one transaction", (_, sql) => {
    expect(sql).toContain("DB NOT EXECUTED");
    expect(sql).toMatch(/^begin;$/m);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
  });
  it.each(all)("%s: every function is security definer with an empty search_path", (_, sql) => {
    const heads = sql.match(/create function [\s\S]*?\$\$/g) ?? [];
    expect(heads.length).toBeGreaterThan(0);
    for (const head of heads) {
      expect(head).toMatch(/set search_path=''/);
      expect(head).toContain("security definer");
    }
  });
  it.each(all)("%s grants nothing to service_role and nothing to anon except the guest proof check", (_, sql) => {
    expect(sql).not.toMatch(/grant [^;]*service_role/i);
    for (const m of sql.matchAll(/grant [^;]* to ([^;]*);/gi)) {
      if (/anon/.test(m[1])) expect(m[0]).toBe("grant execute on function public.verify_visit_proof(text) to anon;");
    }
  });
  it.each(all)("%s never joins the realtime publication, writes booking events or the outbox", (_, sql) => {
    expect(sql).not.toMatch(/alter publication|create publication/i);
    expect(sql).not.toMatch(/insert into public\.(booking_events|notification_outbox)/);
  });
  it.each(all)("%s: audit rows carry ids and an action only", (_, sql) => {
    for (const m of sql.matchAll(/insert into public\.audit_events\(([^)]*)\)/g)) expect(m[1]).toBe("actor_profile_id,action,target_type,target_id");
  });
  it("the gates are seeded off (no state column in the seed)", () => {
    const seeds = all.flatMap(([, sql]) => [...sql.matchAll(/insert into booking_private\.feature_gates\(([^)]*)\)/g)].map(m => m[1]));
    expect(seeds).toEqual(["key", "key"]);
  });
  it("the bucket is private and the predicate is registered with the shared Storage hook", () => {
    expect(photos).toContain("values ('visit-evidence','visit-evidence',false,5242880,array['image/jpeg','image/png'])");
    expect(photos).toContain("insert into providers_private.category_object_checks(checker) values ('dcx_private.photo_object_access(text,text,boolean)')");
    expect(photos).not.toMatch(/alter policy|drop policy/);
  });
});

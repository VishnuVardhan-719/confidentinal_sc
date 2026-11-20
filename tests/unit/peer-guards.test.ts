import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guards from the R9-C5 review of feat/fe2-d (docs/frontend/ADVERSARIAL_REVIEW.md). The files they
 * check belong to other agents and are not on every branch yet, so each block skips while its files are
 * absent and starts guarding as soon as integration brings them in. GUARD_SRC points the scan at another
 * exported src tree (used to prove the guards against feat/fe2-d without editing that worktree).
 */
const SRC = path.resolve(process.env.GUARD_SRC ?? path.resolve(import.meta.dirname, "../../src"));
const at = (rel: string) => path.join(SRC, rel);
const read = (rel: string) => readFileSync(at(rel), "utf8");

function files(dir: string, pick: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full, pick) : pick(name) ? [full] : [];
  });
}

/** The literal members of `export const <name> = [ ... ] as const` in a source file. */
function constTuple(source: string, name: string): string[] | null {
  const m = new RegExp(`export const ${name}\\s*=\\s*\\[([^\\]]*)\\]\\s*as const`).exec(source);
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]) : null;
}

// ---------------------------------------------------------------------------------------------------------
// R9-C5 D1: the doctor reviews view must account for every status the patient reviews module can produce.
// ---------------------------------------------------------------------------------------------------------
const PATIENT_TYPES = "modules/reviews/types.ts";
const DOCTOR_TYPES = "modules/doctor-reviews/types.ts";
/**
 * Patient-side statuses the doctor view does not parse, with the decision that covers them. Known open item:
 * `withdrawn` (REQUESTS.md R-FE-Q-R9C5-1). The server must omit it from the doctor feed; until the contract
 * says so, a withdrawn row makes the whole doctor page fail closed. Add a status here only with a decision.
 */
const DOCTOR_OMITS: Record<string, string> = { withdrawn: "R-FE-Q-R9C5-1: server omits withdrawn reviews from the doctor feed" };

describe.skipIf(!existsSync(at(PATIENT_TYPES)) || !existsSync(at(DOCTOR_TYPES)))("review statuses stay in step (patient vs doctor view)", () => {
  it("every patient review status is either shown to the doctor or explicitly omitted by the server", () => {
    const patient = constTuple(read(PATIENT_TYPES), "REVIEW_STATUSES");
    const doctor = constTuple(read(DOCTOR_TYPES), "REVIEW_STATUSES");
    expect(patient, "REVIEW_STATUSES tuple in reviews/types.ts").not.toBeNull();
    expect(doctor, "REVIEW_STATUSES tuple in doctor-reviews/types.ts").not.toBeNull();
    const unhandled = patient!.filter(s => !doctor!.includes(s) && !(s in DOCTOR_OMITS));
    expect(unhandled).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// R9-C5 D2: a doctor never receives rating or text of a review that moderation has not published.
// ---------------------------------------------------------------------------------------------------------
describe.skipIf(!existsSync(at(DOCTOR_TYPES)))("doctor review projection hides unmoderated content", () => {
  it("the doctor schema rejects rating or text on pending and rejected rows", async () => {
    const mod = (await import(/* @vite-ignore */ at(DOCTOR_TYPES))) as { doctorReviewSchema: { safeParse: (v: unknown) => { success: boolean } } };
    const base = { id: "00000000-0000-4000-8000-0000000000a1", visitMonth: "2026-11", submittedAt: "2026-11-10T10:00:00+05:30" };
    for (const status of ["pending_moderation", "rejected"]) {
      expect(mod.doctorReviewSchema.safeParse({ ...base, status }).success, status).toBe(true);
      expect(mod.doctorReviewSchema.safeParse({ ...base, status, rating: 2 }).success, `${status} + rating`).toBe(false);
      expect(mod.doctorReviewSchema.safeParse({ ...base, status, text: "x".repeat(20) }).success, `${status} + text`).toBe(false);
    }
    expect(mod.doctorReviewSchema.safeParse({ ...base, status: "published", rating: 5, text: "Synthetic text" }).success, "published needs publishedAt").toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------
// R9-C5 D3: redirects that carry a proof-of-visit code never send it on as a Referer and are never cached.
// ---------------------------------------------------------------------------------------------------------
const verifyRoutes = files(at("app/[locale]/verify"), name => name === "route.ts");

describe.skipIf(verifyRoutes.length === 0)("proof-code redirects", () => {
  it("every /verify route handler that redirects sets Referrer-Policy no-referrer and Cache-Control no-store", () => {
    const offenders = verifyRoutes
      .map(file => ({ file: path.relative(SRC, file).replace(/\\/g, "/"), text: readFileSync(file, "utf8") }))
      .filter(f => /\bredirect\(/.test(f.text) && !(/no-referrer/.test(f.text) && /no-store/.test(f.text)))
      .map(f => f.file);
    expect(offenders).toEqual([]);
  });
});

it("the peer guards found the tree they scan", () => {
  expect(existsSync(at("app"))).toBe(true);
});

/**
 * REQUESTS R-FE-Q-R9C3-2 (feat/fe2-c): pages and components must not import fixture values; the
 * fixture actor comes from the session helpers (getPatientSession / getDoctorSession), which sit
 * behind the fixture production guard. Type-only imports are fine (erased at build time).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(d.name) ? [p] : [];
  });
}

/** Import statements (possibly multi-line) from @/fixtures that bring in at least one value. */
function fixtureValueImports(src: string): string[] {
  const stmts = src.match(/import\s[^;]*?from\s*["']@\/fixtures[^"']*["']/g) ?? [];
  return stmts.filter((s) => {
    if (/^import\s+type\s/.test(s)) return false;
    const names = s.match(/\{([^}]*)\}/)?.[1];
    if (names === undefined) return true; // default or namespace import
    return names.split(",").map((n) => n.trim()).filter(Boolean).some((n) => !n.startsWith("type "));
  });
}

describe("no fixture value imports in src/app and src/components (R-FE-Q-R9C3-2)", () => {
  it("the detector sees value imports and ignores type-only ones", () => {
    expect(fixtureValueImports('import { DEFAULT_PATIENT_ACTOR } from "@/fixtures/clinical/world";')).toHaveLength(1);
    expect(fixtureValueImports('import {\n  type FixtureActor,\n  NO_ACTOR,\n} from "@/fixtures/clinical/world";')).toHaveLength(1);
    expect(fixtureValueImports('import type { FixtureActor } from "@/fixtures/clinical/world";')).toHaveLength(0);
    expect(fixtureValueImports('import { type FixtureActor } from "@/fixtures/clinical/world";')).toHaveLength(0);
  });

  it("none exist", () => {
    const offenders = ["src/app", "src/components"]
      .flatMap((d) => sourceFiles(join(ROOT, d)))
      .flatMap((f) => fixtureValueImports(readFileSync(f, "utf8")).map((s) => `${relative(ROOT, f)}: ${s.replace(/\s+/g, " ")}`));
    expect(offenders).toEqual([]);
  });

  it("the patient dashboard takes its fixture actor from getPatientSession()", () => {
    const page = readFileSync(join(ROOT, "src/app/[locale]/patient/dashboard/page.tsx"), "utf8");
    // Integration pages use the real guard wrapper requirePatientSession (same session helper module).
    expect(page).toMatch(/getPatientSession\(\)|requirePatientSession\(/);
    expect(page).toMatch(/fixtureActor(:|\s*=)\s*session\.fixtureActor/);
    expect(page).not.toMatch(/DEFAULT_PATIENT_ACTOR/);
  });
});

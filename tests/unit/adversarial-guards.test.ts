import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { NAMESPACES } from "@/i18n/messages";
import { LOCALES } from "@/i18n/routing";
import { journeyApis } from "@/modules/bookings/journey";

/**
 * Static guards for the R9-C2 adversarial review (docs/frontend/ADVERSARIAL_REVIEW.md). Each block names the
 * finding it locks in. Exemptions are known defects in files owned by other agents; each one points at the
 * REQUESTS.md entry with the proposed patch and should be deleted when the owner's fix lands.
 */
const SRC = path.resolve(import.meta.dirname, "../../src");
function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts") ? [full] : [];
  });
}
/** True when the file starts with the "use client" directive, after any leading comments and blank lines. */
function isClientFile(text: string): boolean {
  const body = text.replace(/^\uFEFF/, "").replace(/^(?:\s+|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*/, "");
  return /^["']use client["']/.test(body);
}
const ALL = sources().map(file => ({ file: path.relative(SRC, file).replace(/\\/g, "/"), text: readFileSync(file, "utf8") }));

// ---------------------------------------------------------------------------------------------------------
// Finding 1: synthetic cancellation terms must never reach a real (http) booking.
// ---------------------------------------------------------------------------------------------------------
describe("booking cancellation terms come from the adapter, not a fixture constant", () => {
  it("http mode has no terms, so the cancel dialog fails closed", () => {
    expect(journeyApis({ FRONTEND_ADAPTER: "http", APP_ENV: "test" }).cancellationTerms).toBeNull();
    expect(journeyApis({ APP_ENV: "production" }).cancellationTerms).toBeNull();
  });

  it("fixture mode exposes the labelled synthetic terms", () => {
    expect(journeyApis({ FRONTEND_ADAPTER: "fixture", APP_ENV: "test" }).cancellationTerms).toEqual({ version: "synthetic-v1", cancelWindowMinutes: 120 });
  });
});

// ---------------------------------------------------------------------------------------------------------
// Fixture imports outside src/fixtures are gated.
// ---------------------------------------------------------------------------------------------------------
type FixtureImport = { file: string; names: string[]; from: string };
function fixtureValueImports(): FixtureImport[] {
  const out: FixtureImport[] = [];
  for (const f of ALL.filter(item => !item.file.startsWith("fixtures/"))) {
    for (const m of f.text.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+"(@\/fixtures\/[^"]+)"/g)) {
      if (m[1]) continue;
      const names = m[2].split(",").map(part => part.trim()).filter(part => part && !part.startsWith("type ")).map(part => part.split(/\s+as\s+/)[0]);
      if (names.length) out.push({ file: f.file, names, from: m[3] });
    }
    if (/import\s+\*\s+as\s+\w+\s+from\s+"@\/fixtures\//.test(f.text) || /import\s+\w+\s+from\s+"@\/fixtures\//.test(f.text)) out.push({ file: f.file, names: ["*"], from: "@/fixtures" });
  }
  return out;
}
/** Values with no synthetic data in them: safe in any mode. */
const SENTINELS = new Set(["NO_ACTOR"]);
const GATE = /\b(getAdapterMode|isFixtureMode|isFixtureAdapter|fixtureGuard|assertFixtureAllowed)\b/;
/**
 * Reviewed UI-layer files allowed a fixture value import (file -> reason). Each must still contain a mode check.
 * Keep this short: prefer reading fixture actors from a session module.
 */
const UI_ALLOWED: Record<string, string> = {
  "app/[locale]/patient/dashboard/page.tsx": "fe-d: DEFAULT_PATIENT_ACTOR only when isFixtureAdapter(); move to getPatientSession().fixtureActor (REQUESTS R-FE-Q-R9C3-2)",
};
/**
 * Pure fixture mappers that never run on their own: every file importing them must check the adapter mode first.
 */
const GATED_BY_CALLER: Record<string, string> = {
  "modules/auth/fixture-actors.ts": "maps a synthetic identity to a fixture actor; doctor/patient sessions call it only when isFixtureAdapter()",
};

describe("fixture adapter is unreachable outside fixture mode", () => {
  const imports = fixtureValueImports();

  it("finds the fixture imports it is guarding (scan sanity check)", () => {
    expect(imports.some(i => i.file === "modules/bookings/journey.ts")).toBe(true);
  });

  it("pages, layouts and components never import fixture values", () => {
    const offenders = imports
      .filter(i => /^(app|components)\//.test(i.file) && !(i.file in UI_ALLOWED && GATE.test(ALL.find(f => f.file === i.file)?.text ?? "")))
      .map(i => `${i.file}: ${i.names.join(", ")} from ${i.from}`);
    expect(offenders).toEqual([]);
  });

  it("client components never import fixture values", () => {
    const client = new Set(ALL.filter(f => isClientFile(f.text)).map(f => f.file));
    expect(imports.filter(i => client.has(i.file)).map(i => i.file)).toEqual([]);
  });

  it("every other file importing fixture values checks the adapter mode or calls a fixture guard", () => {
    const text = new Map(ALL.map(f => [f.file, f.text]));
    const offenders = imports
      .filter(i => !/^(app|components)\//.test(i.file))
      .filter(i => i.names.some(name => !SENTINELS.has(name)))
      .filter(i => !GATE.test(text.get(i.file) ?? "") && !(i.file in GATED_BY_CALLER))
      .map(i => `${i.file}: ${i.names.join(", ")}`);
    expect(offenders).toEqual([]);
  });

  it("every importer of a caller-gated fixture mapper checks the adapter mode", () => {
    const offenders: string[] = [];
    for (const mapper of Object.keys(GATED_BY_CALLER)) {
      const spec = "@/" + mapper.replace(/\.ts$/, "");
      for (const f of ALL.filter(item => item.text.includes(`"${spec}"`))) if (!GATE.test(f.text)) offenders.push(`${f.file} imports ${spec}`);
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Findings 3 and 6: money stays integer paise; rupee conversion only inside the approved formatters.
// ---------------------------------------------------------------------------------------------------------
const PAISE_TO_RUPEES_ALLOWED = new Set([
  "lib/format/index.ts",
  "components/payments/money.ts",
  "components/admin/ops/format.ts",
  "components/clinical/kit.ts",
  "modules/onboarding/form-models.ts",
]);
/**
 * Known defect (fe-e): lab catalogue editor default. Already fixed on feat/fe2-e c99a4c7 (paiseToRupeesString);
 * delete this entry once that merge lands here.
 */
const MONEY_EXEMPT = new Set(["components/lab/lab-views.tsx"]);

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

describe("money maths stays in integer paise", () => {
  it("never calls toFixed or parseFloat on a paise value", () => {
    const offenders: string[] = [];
    for (const f of ALL.filter(item => !MONEY_EXEMPT.has(item.file))) {
      f.text.split("\n").forEach((line, i) => {
        if (/paise/i.test(line) && /\.toFixed\(|parseFloat\(/.test(line)) offenders.push(`${f.file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("divides paise by 100 only inside the approved formatters", () => {
    const offenders: string[] = [];
    for (const f of ALL.filter(item => !PAISE_TO_RUPEES_ALLOWED.has(item.file) && !MONEY_EXEMPT.has(item.file))) {
      for (const m of f.text.matchAll(/\b\w*[Pp]aise\w*\)?\s*\/\s*100\b/g)) offenders.push(`${f.file}:${lineOf(f.text, m.index)}`);
    }
    expect(offenders).toEqual([]);
  });

  it("the guard catches the forms it is meant to catch", () => {
    expect(/paise/i.test("price: (r.pricePaise / 100).toFixed(2)") && /\.toFixed\(/.test("(r.pricePaise / 100).toFixed(2)")).toBe(true);
    expect("x = amountPaise / 100".match(/\b\w*[Pp]aise\w*\)?\s*\/\s*100\b/)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------
// Finding 4: in locales where CLDR puts 0 in "one" (Hindi), a "one" branch must use # or the message needs =0.
// ---------------------------------------------------------------------------------------------------------
type Json = { [k: string]: string | Json };
function flatten(obj: Json, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}
const load = (locale: string, ns: string) => flatten(JSON.parse(readFileSync(path.join(SRC, "messages", locale, `${ns}.json`), "utf8")) as Json);

/** Index of the "}" that closes the "{" at `open`. */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

/** Every plural argument in an ICU message (nested ones included) as selector -> branch text. */
function pluralArguments(message: string): Map<string, string>[] {
  const out: Map<string, string>[] = [];
  for (const m of message.matchAll(/\{\s*\w+\s*,\s*(plural|selectordinal)\s*,/g)) {
    const start = m.index;
    const end = closing(message, start);
    if (end < 0) continue;
    const branches = new Map<string, string>();
    let i = start + m[0].length;
    while (i < end) {
      const sel = /^\s*(offset:\s*\d+\s*)?(=\d+|zero|one|two|few|many|other)\s*\{/.exec(message.slice(i, end));
      if (!sel) break;
      const open = i + sel[0].length - 1;
      const close = closing(message, open);
      branches.set(sel[2], message.slice(open + 1, close));
      i = close + 1;
    }
    out.push(branches);
  }
  return out;
}

/** A "one" branch is wrong for 0 when it spells the number and no =0 branch takes 0 first. */
function zeroUnsafePlurals(message: string): number {
  return pluralArguments(message).filter(b => b.has("one") && !b.has("=0") && !/#/.test(b.get("one") ?? "")).length;
}

/**
 * Known defects in other agents' catalogues; the proposed patch is REQUESTS.md R-FE-Q-R9C3-1.
 * Delete an entry when its owner applies the fix (the test then guards it).
 */
const HI_PLURAL_EXEMPT = new Set([
  "hi:ambulance.dashboard.daysLeft", // fe-e
  "hi:lab.orders.testCount", // fe-e
  "hi:common.errorSummary.title", // fe-a
  "hi:auth.otp.attemptsLeft", // fe-b (integration only)
]);

describe("plural messages are correct for zero", () => {
  const zeroIsOne = LOCALES.filter(locale => new Intl.PluralRules(locale).select(0) === "one");

  it("CLDR puts 0 in Hindi 'one' and not in Telugu or English 'one'", () => {
    expect(zeroIsOne).toEqual(["hi"]);
  });

  it("the parser finds branches, including nested and text-wrapped plurals", () => {
    const args = pluralArguments("PIN {pin}: {count, plural, =0 {none} one {# item} other {# items}} left");
    expect(args).toHaveLength(1);
    expect([...args[0].keys()]).toEqual(["=0", "one", "other"]);
    expect(zeroUnsafePlurals("{count, plural, one {1 दिन बाकी} other {# दिन बाकी}}")).toBe(1);
    expect(zeroUnsafePlurals("{count, plural, one {# दिन बाकी} other {# दिन बाकी}}")).toBe(0);
    expect(zeroUnsafePlurals("{count, plural, =0 {कोई नहीं} one {1 दिन} other {# दिन}}")).toBe(0);
    expect(zeroUnsafePlurals("{a, plural, other {{b, plural, one {1 x} other {# x}}}}")).toBe(1);
  });

  it("every 'one' branch in those locales uses # or has an =0 case", () => {
    const offenders: string[] = [];
    for (const locale of zeroIsOne) {
      for (const ns of NAMESPACES) {
        for (const [key, value] of Object.entries(load(locale, ns))) {
          const id = `${locale}:${ns}.${key}`;
          if (zeroUnsafePlurals(value) > 0 && !HI_PLURAL_EXEMPT.has(id)) offenders.push(`${id} = ${value}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("te and hi keep the same plural arguments as English", () => {
    const mismatched: string[] = [];
    for (const ns of NAMESPACES) {
      const en = load("en", ns);
      for (const locale of LOCALES.filter(l => l !== "en")) {
        for (const [key, value] of Object.entries(load(locale, ns))) {
          const has = (s: string) => pluralArguments(s).length;
          if (en[key] !== undefined && has(en[key]) !== has(value)) mismatched.push(`${locale}:${ns}.${key}`);
          if (pluralArguments(value).some(b => !b.has("other"))) mismatched.push(`${locale}:${ns}.${key} (no other)`);
        }
      }
    }
    expect(mismatched).toEqual([]);
  });
});

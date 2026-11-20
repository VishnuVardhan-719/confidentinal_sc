import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guards from the R9-C12 second adversarial pass (docs/frontend/ADVERSARIAL_REVIEW.md). They pin the
 * current, reviewed state so a new ad-hoc money formatter, analytics SDK, client-side env read, unlabelled dialog
 * or "failed list shown as empty" fallback fails CI. GUARD_SRC points the scan at another exported src tree.
 */
const SRC = path.resolve(process.env.GUARD_SRC ?? path.resolve(import.meta.dirname, "../../src"));
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const ALL = walk(SRC).filter(f => /\.(ts|tsx)$/.test(f) && !f.endsWith(".d.ts"))
  .map(file => ({ file: path.relative(SRC, file).replace(/\\/g, "/"), text: readFileSync(file, "utf8") }));
const CODE = ALL.filter(f => !f.file.startsWith("fixtures/"));
const code = (line: string) => !/^\s*(\*|\/\/|\/\*)/.test(line);
const hits = (files: typeof CODE, re: RegExp) =>
  files.flatMap(f => f.text.split("\n").map((line, i) => (code(line) && re.test(line) ? `${f.file}:${i + 1}` : null)).filter((x): x is string => x !== null));

// (a) Money: the reviewed formatters and parsers are the only ones (finding 3 / C12-1 consolidate them later).
const CURRENCY_FORMATTERS = new Set([
  "lib/format/index.ts",
  "components/payments/money.ts",
  "components/admin/ops/format.ts",
  "components/clinical/server-format.ts",
  "components/clinical/use-format.ts",
]);
const RUPEE_PARSERS = new Set(["components/clinical/kit.ts", "modules/lab/rules.ts", "modules/onboarding/form-models.ts"]);

describe("C12 (a): no new ad-hoc money formatting", () => {
  it("Intl currency formatting lives only in the reviewed formatter files", () => {
    const files = [...new Set(hits(CODE, /style:\s*["']currency["']/).map(h => h.split(":")[0]))];
    expect(files.filter(f => !CURRENCY_FORMATTERS.has(f))).toEqual([]);
  });

  it("rupee-to-paise parsers live only in the reviewed files", () => {
    const defs = CODE.flatMap(f => [...f.text.matchAll(/export\s+(?:function|const)\s+(\w*(?:[Rr]upees?To\w*Paise|parse\w*Rupee\w*))\b/g)].map(m => `${f.file}: ${m[1]}`));
    expect(defs.filter(d => !RUPEE_PARSERS.has(d.split(":")[0]))).toEqual([]);
  });
});

// (b) PHI must not leave through analytics or beacons; there is no approved analytics vendor.
describe("C12 (b): no analytics, telemetry or beacons", () => {
  it("no analytics SDK import, gtag/dataLayer or sendBeacon in src", () => {
    const re = /from\s+["'](?:@vercel\/(?:analytics|speed-insights)|posthog-js|@sentry\/\w+|@segment\/\w+|mixpanel-browser|@amplitude\/\w+|react-ga4?|plausible-tracker)["']|\bgtag\(|\bdataLayer\b|navigator\.sendBeacon|useReportWebVitals/;
    expect(hits(CODE, re)).toEqual([]);
  });
});

// (c) No public admin signup.
const ROLES_FILE = "modules/auth/roles.ts";
describe.skipIf(!existsSync(path.join(SRC, ROLES_FILE)))("C12 (c): signup never offers admin", () => {
  it("SIGNUP_ROLES excludes admin and the signup schema is built from it", () => {
    const text = readFileSync(path.join(SRC, ROLES_FILE), "utf8");
    const roles = /export const SIGNUP_ROLES\s*=\s*\[([^\]]*)\]/.exec(text)?.[1] ?? "";
    expect(roles).not.toBe("");
    expect(roles).not.toMatch(/["']admin["']/);
    expect(text).toMatch(/signupRoleSchema\s*=\s*z\.enum\(SIGNUP_ROLES\)/);
  });
});

// (d) Adapter mode and env are server decisions; a client bundle must never read them.
describe("C12 (d): client components never read env or adapter mode", () => {
  it("no process.env, getAdapterMode, isFixtureMode or isFixtureAdapter in a 'use client' file", () => {
    const client = CODE.filter(f => /^\s*["']use client["']/.test(f.text));
    expect(hits(client, /process\.env|getAdapterMode\(|isFixtureMode\(|isFixtureAdapter\(/)).toEqual([]);
  });
});

// (e) A failed list must not be rendered as an honest empty list.
/** Known case, owner fe-d (C12-3): photo list falls back to [] when consent loaded but photos failed. */
const EMPTY_FALLBACK_EXEMPT = new Set(["app/[locale]/doctor/visits/[id]/consultation/page.tsx"]);
describe("C12 (e): pages do not turn a failed result into empty data", () => {
  it("no `x.ok ? x.data... : []` in route files", () => {
    const pages = CODE.filter(f => f.file.startsWith("app/") && !EMPTY_FALLBACK_EXEMPT.has(f.file));
    expect(hits(pages, /\b\w+\.ok\s*\?\s*\w+\.data[\w.]*\s*:\s*\[\]/)).toEqual([]);
  });
});

// (f) Dialogs and sheets: every content element has a title and a description (Radix handles focus).
describe("C12 (f): dialogs and sheets are labelled", () => {
  it("each file rendering Dialog/AlertDialog/Sheet content also renders its Title and a Description", () => {
    const offenders: string[] = [];
    for (const f of CODE.filter(item => item.file.endsWith(".tsx") && !item.file.startsWith("components/ui/"))) {
      for (const kind of ["Dialog", "AlertDialog", "Sheet", "Drawer"]) {
        const contents = (f.text.match(new RegExp(`<${kind}Content\\b`, "g")) ?? []).length;
        if (!contents) continue;
        const titles = (f.text.match(new RegExp(`<${kind}Title\\b`, "g")) ?? []).length;
        const descriptions = (f.text.match(new RegExp(`<${kind}Description\\b|aria-describedby`, "g")) ?? []).length;
        if (titles < contents || descriptions < contents) offenders.push(`${f.file}: ${kind} content=${contents} title=${titles} description=${descriptions}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("finds the dialogs it guards (scan sanity check)", () => {
    expect(CODE.some(f => /<(Dialog|Sheet)Content\b/.test(f.text))).toBe(true);
  });
});

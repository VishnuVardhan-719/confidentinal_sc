import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Repo-wide static guards from the R9-C6 review (docs/frontend/ADVERSARIAL_REVIEW.md). Earlier guards covered
 * only fe-c's own files (tests/unit/modules-services/invariants-c.test.ts) or browser storage; these apply to
 * every agent's code so the rules hold after integration. GUARD_SRC points the scan at another exported src
 * tree (used to prove the guards against other branches without editing their worktrees).
 */
const SRC = path.resolve(process.env.GUARD_SRC ?? path.resolve(import.meta.dirname, "../../src"));
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const rel = (file: string) => path.relative(SRC, file).replace(/\\/g, "/");
const ALL = walk(SRC).map(file => ({ file: rel(file), text: readFileSync(file, "utf8") }));
const CODE = ALL.filter(f => /\.(ts|tsx)$/.test(f.file) && !f.file.endsWith(".d.ts"));
const byFile = new Map(ALL.map(f => [f.file, f.text]));
const isComment = (line: string) => /^\s*(\*|\/\/|\/\*)/.test(line);

function scan(files: typeof CODE, test: (line: string) => string[] | null): string[] {
  const hits: string[] = [];
  for (const f of files) {
    f.text.split("\n").forEach((line, i) => {
      if (isComment(line)) return;
      for (const hit of test(line) ?? []) hits.push(`${f.file}:${i + 1}: ${hit}`);
    });
  }
  return hits;
}

// ---------------------------------------------------------------------------------------------------------
// Hard-coded English outside i18n (every .tsx, not only fe-c's).
// ---------------------------------------------------------------------------------------------------------
function englishInJsx(line: string): string[] {
  const out: string[] = [];
  if (/^\s+[A-Z][a-z]+( [a-zA-Z,.'-]+){2,}\s*$/.test(line)) out.push(`text line "${line.trim()}"`);
  for (const m of line.matchAll(/(?<![=\-])>\s*([A-Za-z][A-Za-z ,.'!?:-]{2,})\s*</g)) out.push(`text "${m[1].trim()}"`);
  for (const m of line.matchAll(/\b(aria-label|title|placeholder|alt|label)="([A-Za-z][^"]{1,})"/g)) out.push(`${m[1]}="${m[2]}"`);
  return out;
}

describe("no hard-coded English in any component or page", () => {
  it("the detector catches JSX text, text-only lines and literal accessible names", () => {
    expect(englishInJsx("<p>Book a visit</p>")).toHaveLength(1);
    expect(englishInJsx("        Choose a doctor first")).toHaveLength(1);
    expect(englishInJsx('<input aria-label="Search doctors" />')).toHaveLength(1);
    expect(englishInJsx('<p>{t("title")}</p>')).toEqual([]);
    expect(englishInJsx('<a className="x" href="/en">{label}</a>')).toEqual([]);
  });

  it("every .tsx file under src renders text through messages", () => {
    expect(scan(CODE.filter(f => f.file.endsWith(".tsx")), englishInJsx)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// PHI in storage, logs and URLs.
// ---------------------------------------------------------------------------------------------------------
describe("no private data in browser storage, logs or query strings", () => {
  it("no source file uses indexedDB, document.cookie or console output", () => {
    // localStorage/sessionStorage are already guarded in invariants-c.test.ts.
    const hits = scan(CODE, line => (/\b(indexedDB|document\.cookie)\b|\bconsole\.(log|info|warn|error|debug|trace)\(/.test(line) ? [line.trim()] : null));
    expect(hits).toEqual([]);
  });

  /** Query keys that would carry identity, contact, location or clinical text. */
  const PERSONAL_KEY = /^(name|full_?name|first_?name|last_?name|patient(Name)?|phone|mobile|email|dob|birth\w*|age|gender|address\w*|street|lat|lng|lon|latitude|longitude|coords?|location|diagnosis|symptoms?Text|notes?|reasonText|visitReason|prescription|otp|password|token|aadhaar|abha)$/i;
  function queryKeys(line: string): string[] {
    const keys = [...line.matchAll(/[?&]([a-zA-Z_]+)=/g)].map(m => m[1]);
    keys.push(...[...line.matchAll(/searchParams\.(?:set|append)\(\s*["']([a-zA-Z_]+)["']/g)].map(m => m[1]));
    for (const m of line.matchAll(/new URLSearchParams\(\{([^}]*)\}/g)) {
      keys.push(...m[1].split(",").map(part => part.split(":")[0].trim()).filter(key => /^[a-zA-Z_]+$/.test(key)));
    }
    return keys;
  }

  it("the query-key detector reads template URLs, searchParams.set and URLSearchParams objects", () => {
    expect(queryKeys("router.push(`/patient/family?status=${s}&phone=${p}`)")).toEqual(["status", "phone"]);
    expect(queryKeys('to.searchParams.set("email", value)')).toEqual(["email"]);
    expect(queryKeys('"/x?" + new URLSearchParams({ providerId: id, lat })')).toEqual(["providerId", "lat"]);
  });

  it("no link, redirect or URL builder puts a personal-data key in the query string", () => {
    const hits = scan(CODE, line => queryKeys(line).filter(k => PERSONAL_KEY.test(k)));
    expect(hits).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Money: no float formatting of prices, amounts or fees (paise-named values are guarded in adversarial-guards).
// ---------------------------------------------------------------------------------------------------------
/** Known defect (fe-e): fixed on feat/fe2-e 0500117 (paiseToRupeesString); delete once merged here. */
const MONEY_EXEMPT = new Set(["components/lab/lab-views.tsx"]);

describe("money is never formatted with floats", () => {
  it("no toFixed or parseFloat on a line about prices, amounts, fees or rupees", () => {
    const hits = scan(CODE.filter(f => !MONEY_EXEMPT.has(f.file)), line => (/(price|amount|fee|rupee|paise|total)/i.test(line) && /\.toFixed\(|parseFloat\(/.test(line) ? [line.trim()] : null));
    expect(hits).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Private routes are noindex (page metadata or an ancestor layout) and disallowed in robots.txt.
// ---------------------------------------------------------------------------------------------------------
const PRIVATE_AREAS = ["patient", "doctor", "lab", "ambulance", "caretaker", "admin", "workspace", "account"];
const AREA_RE = new RegExp(`^app/\\[locale\\]/(?:\\([^)]+\\)/)*(${PRIVATE_AREAS.join("|")})/`);
const NOINDEX = /index:\s*false|privateMetadata\(|noindex/;
/** A page that only redirects renders nothing, so it has nothing to index. */
const redirectOnly = (text: string) => /\bredirect\(/.test(text) && !/<[A-Za-z]/.test(text);

function noindexCovered(page: string): boolean {
  if (NOINDEX.test(byFile.get(page) ?? "")) return true;
  const parts = page.split("/");
  for (let n = parts.length - 1; n >= 2; n--) {
    if (NOINDEX.test(byFile.get(`${parts.slice(0, n).join("/")}/layout.tsx`) ?? "")) return true;
  }
  return false;
}

describe("private routes are not indexable", () => {
  const pages = ALL.filter(f => AREA_RE.test(f.file) && f.file.endsWith("/page.tsx")).map(f => f.file);

  it("finds the private pages it guards (scan sanity check)", () => {
    expect(pages.length).toBeGreaterThan(10);
  });

  it("every private page sets robots noindex itself or through a layout, unless it only redirects", () => {
    const missing = pages.filter(p => !noindexCovered(p) && !redirectOnly(byFile.get(p) ?? ""));
    expect(missing).toEqual([]);
  });

  it("robots.txt disallows every private area that exists under src/app/[locale]", () => {
    const robots = byFile.get("app/robots.ts") ?? "";
    const listed = /PRIVATE_SEGMENTS\s*=\s*\[([^\]]*)\]/.exec(robots)?.[1] ?? "";
    const segments = [...listed.matchAll(/"([^"]+)"/g)].map(m => m[1]);
    const present = new Set(ALL.map(f => AREA_RE.exec(f.file)?.[1]).filter((s): s is string => !!s));
    expect([...present].filter(area => !segments.includes(area))).toEqual([]);
    expect(robots).toMatch(/disallow:\s*\[[^\]]*PRIVATE_SEGMENTS/);
  });
});

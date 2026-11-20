import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Repo-wide guard (ADVERSARIAL_REVIEW finding 3): paise become rupee text only in src/lib/money.
 * Fails on new ad-hoc formatting anywhere else in src:
 *   - division or modulo by 100 on a line about money (paise, rupee, amount, price, fee, total, money)
 *   - Intl or next-intl currency style (style: "currency")
 *   - toFixed on a money line
 *   - string-built rupee amounts ("₹" + x, `₹${x}`)
 * Parsing typed rupees into paise (x * 100) is not formatting and is not checked here.
 *
 * MONEY_GUARD_SRC can point at another src folder (for example an integration export).
 */

const ROOT = process.env.MONEY_GUARD_SRC ?? path.resolve(import.meta.dirname, "../../src");
const CANONICAL = "lib/money/index.ts";

type Rule = "div100" | "currencyStyle" | "toFixed" | "rupeeConcat";
const MONEY_WORDS = /paise|rupee|amount|price|fee|total|money|\binr\b/i;
const RULES: Record<Rule, (line: string) => boolean> = {
  div100: (l) => /[/%]\s*100\b(?!\s*[*/])/.test(l) && MONEY_WORDS.test(l),
  currencyStyle: (l) => /style\s*:\s*["']currency["']/.test(l),
  toFixed: (l) => /\.toFixed\s*\(/.test(l) && MONEY_WORDS.test(l),
  rupeeConcat: (l) => /(₹|\\u20b9)\$\{|["'`](₹|\\u20b9)\s*["'`]\s*\+|\+\s*["'`](₹|\\u20b9)/i.test(l),
};

/**
 * Exact current offenders, outside fe-b's files (they are on feat/fe2-integration fec9da1, not on
 * feat/fe2-e). Each one is listed with its trimmed line, so any NEW line in the same file still
 * fails. Patches: docs/frontend/REQUESTS.md R-E9E6-01 to R-E9E6-03. Delete an entry when its owner
 * migrates; the "stale" test below fails if an entry no longer matches a file that exists.
 */
const ALLOWED: { file: string; rule: Rule; line: string; owner: string }[] = [
  // fe-q (fe-c data layer): R-E9E6-01. Shared formatter that throws; to delegate to src/lib/money.
  { file: "lib/format/index.ts", rule: "currencyStyle", owner: "fe-q", line: 'const formatter = new Intl.NumberFormat(localeTags[locale], { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });' },
  { file: "lib/format/index.ts", rule: "div100", owner: "fe-q", line: 'const fraction = new Intl.NumberFormat(localeTags[locale], { useGrouping: false, minimumIntegerDigits: 2 }).format(paise % 100);' },
  { file: "lib/format/index.ts", rule: "div100", owner: "fe-q", line: 'return formatter.formatToParts(Math.floor(paise / 100)).map(part => part.type === "fraction" ? fraction : part.value).join("");' },
  // fe-a payments: R-E9E6-02. Drops ".00" for whole rupees, so "₹800" here and "₹800.00" elsewhere.
  { file: "components/payments/money.ts", rule: "currencyStyle", owner: "fe-a", line: 'style: "currency",' },
  { file: "components/payments/money.ts", rule: "div100", owner: "fe-a", line: "minimumFractionDigits: paise % 100 === 0 ? 0 : 2," },
  { file: "components/payments/money.ts", rule: "div100", owner: "fe-a", line: "}).format(paise / 100);" },
  // fe-d clinical: R-E9E6-03. Float rupees through next-intl number(); no integer or sign check.
  { file: "components/clinical/kit.ts", rule: "div100", owner: "fe-d", line: "export const rupees = (paise: number): number => paise / 100;" },
  { file: "components/clinical/server-format.ts", rule: "currencyStyle", owner: "fe-d", line: 'money: (paise) => f.number(rupees(paise), { style: "currency", currency: "INR", maximumFractionDigits: 2 }),' },
  { file: "components/clinical/use-format.ts", rule: "currencyStyle", owner: "fe-d", line: 'money: (paise: number) => f.number(rupees(paise), { style: "currency", currency: "INR", maximumFractionDigits: 2 }),' },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name) ? [full] : [];
  });
}

const rel = (full: string) => path.relative(ROOT, full).split(path.sep).join("/");
const isComment = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line);

type Hit = { file: string; rule: Rule; line: string; at: number };
function scan(): Hit[] {
  const hits: Hit[] = [];
  for (const full of sourceFiles(ROOT)) {
    const file = rel(full);
    if (file === CANONICAL) continue;
    readFileSync(full, "utf8")
      .split(/\r?\n/)
      .forEach((raw, i) => {
        if (isComment(raw)) return;
        for (const [rule, test] of Object.entries(RULES) as [Rule, (l: string) => boolean][]) {
          if (test(raw)) hits.push({ file, rule, line: raw.trim(), at: i + 1 });
        }
      });
  }
  return hits;
}

const allowed = (h: Hit) => ALLOWED.some((a) => a.file === h.file && a.rule === h.rule && a.line === h.line);

describe("money formatting guard", () => {
  const hits = scan();

  it("the canonical formatter exists", () => {
    expect(existsSync(path.join(ROOT, CANONICAL))).toBe(true);
  });

  it("finds no ad-hoc paise-to-rupee formatting outside src/lib/money", () => {
    const offenders = hits.filter((h) => !allowed(h)).map((h) => `${h.file}:${h.at} [${h.rule}] ${h.line}`);
    expect(offenders, "use formatPaise / formatSignedPaise / paiseToDecimalString from @/lib/money").toEqual([]);
  });

  it("has no stale allowlist entries for files that exist", () => {
    const stale = ALLOWED.filter((a) => existsSync(path.join(ROOT, a.file)))
      .filter((a) => !hits.some((h) => h.file === a.file && h.rule === a.rule && h.line === a.line))
      .map((a) => `${a.owner} ${a.file} [${a.rule}] ${a.line}`);
    expect(stale, "this offender was fixed: delete its ALLOWED entry").toEqual([]);
  });

  it.each([
    ["div100", "const rupees = amountPaise / 100;", true],
    ["div100", "const pct = done / 100;", false],
    ["div100", "const paise = rupees * 100 + fraction;", false],
    ["currencyStyle", 'new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" })', true],
    ["toFixed", "(r.pricePaise / 100).toFixed(2)", true],
    ["toFixed", "lat.toFixed(4)", false],
    ["rupeeConcat", "`₹${amount}`", true],
    ["rupeeConcat", '"₹" + amount', true],
    ["rupeeConcat", "<span>₹</span>", false],
  ] as [Rule, string, boolean][])("rule %s flags %j: %s", (rule, line, expected) => {
    expect(RULES[rule](line)).toBe(expected);
  });
});

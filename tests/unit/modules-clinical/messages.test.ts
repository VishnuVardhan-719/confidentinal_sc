import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * i18n coverage for the doctor workspace and clinical editor (PHASE2-D):
 * - te/hi have exactly the en keys, no empty strings, and the same ICU arguments;
 * - te/hi are real translations (identical-to-English only for unit symbols);
 * - every full "namespace.path" label key used as data in modules/components resolves in all
 *   three locales (status maps cannot be checked by next-intl's literal key types).
 */
const LOCALES = ["en", "te", "hi"] as const;
const NAMESPACES = ["doctor", "clinical"] as const;
const LOOKUP_NAMESPACES = ["doctor", "clinical", "common", "errors"] as const;
/** Values allowed to equal English. Empty: the shared ui-messages test forbids copies too. */
const SAME_AS_EN_OK = new Set<string>();

type Tree = { [k: string]: string | Tree };
const load = (locale: string, ns: string): Tree => JSON.parse(readFileSync(join("src/messages", locale, `${ns}.json`), "utf8")) as Tree;
const flatten = (t: Tree, prefix = ""): Map<string, string> =>
  new Map(Object.entries(t).flatMap(([k, v]) => (typeof v === "string" ? [[prefix + k, v] as const] : [...flatten(v, `${prefix}${k}.`)])));
const icuArgs = (s: string): string[] => [...s.matchAll(/\{\s*([A-Za-z_]\w*)\s*[,}]/g)].map((m) => m[1]).sort();

describe("doctor/clinical messages: locale parity", () => {
  for (const ns of NAMESPACES) {
    const en = flatten(load("en", ns));
    it(`${ns}: en is not empty`, () => expect(en.size).toBeGreaterThan(50));
    for (const locale of ["te", "hi"] as const) {
      const other = flatten(load(locale, ns));
      it(`${ns}/${locale} has exactly the en keys`, () => {
        expect([...en.keys()].filter((k) => !other.has(k))).toEqual([]);
        expect([...other.keys()].filter((k) => !en.has(k))).toEqual([]);
      });
      it(`${ns}/${locale} has no empty, corrupted or untranslated values`, () => {
        for (const [k, v] of other) {
          expect(v.trim(), `${ns}.${k}`).not.toBe("");
          expect(v.includes("\uFFFD"), `${ns}.${k}`).toBe(false);
          if (!SAME_AS_EN_OK.has(`${ns}:${k}`)) expect(v, `${ns}.${k} copied from en`).not.toBe(en.get(k));
        }
      });
      it(`${ns}/${locale} keeps the same ICU arguments`, () => {
        for (const [k, v] of en) expect(icuArgs(other.get(k) ?? ""), `${ns}.${k}`).toEqual(icuArgs(v));
      });
    }
  }
});

describe("doctor/clinical messages: data label keys resolve", () => {
  const roots = ["src/modules/clinical", "src/modules/doctor", "src/modules/records", "src/components/clinical", "src/components/doctor"];
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
  const files = roots.flatMap(walk).filter((f) => /\.tsx?$/.test(f));
  const keyPattern = new RegExp(`["'\`]((?:${LOOKUP_NAMESPACES.join("|")})\\.[A-Za-z_]\\w*(?:\\.[A-Za-z_]\\w*)+)["'\`]`, "g");
  const keys = new Set(files.flatMap((f) => [...readFileSync(f, "utf8").matchAll(keyPattern)].map((m) => m[1])));
  const tables = new Map<string, Map<string, string>>(LOCALES.flatMap((l) => LOOKUP_NAMESPACES.map((ns) => [`${l}:${ns}`, flatten(load(l, ns))] as const)));

  it("finds the status-map keys (sanity)", () => {
    expect(keys.has("clinical.status.unknown")).toBe(true);
    expect(keys.size).toBeGreaterThan(40);
  });

  it("every label key exists in en, te and hi", () => {
    const missing: string[] = [];
    for (const key of keys) {
      const [ns, ...rest] = key.split(".");
      for (const l of LOCALES) if (!tables.get(`${l}:${ns}`)?.has(rest.join("."))) missing.push(`${l}:${key}`);
    }
    expect(missing).toEqual([]);
  });
});

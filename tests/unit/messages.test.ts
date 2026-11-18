import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NAMESPACES } from "@/i18n/messages";
import { LOCALES } from "@/i18n/routing";

const SRC = path.resolve(import.meta.dirname, "../../src");
const ROOT = path.join(SRC, "messages");

/** Keys whose value is intentionally identical in every locale (brand, endonyms, templates). */
const SAME_IN_ALL_LOCALES = new Set([
  "common.brand",
  "common.meta.titleTemplate",
  "common.locales.en",
  "common.locales.te",
  "common.locales.hi",
  "common.footer.columns.company",
]);

type Json = { [k: string]: string | Json };

function load(locale: string, ns: string): Json {
  return JSON.parse(readFileSync(path.join(ROOT, locale, `${ns}.json`), "utf8")) as Json;
}

function flatten(obj: Json, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\s*[,}]/g)].map((m) => m[1]).sort();

describe("message catalogues", () => {
  it("has a file for every namespace in every locale and nothing else", () => {
    for (const locale of LOCALES) {
      const files = readdirSync(path.join(ROOT, locale)).filter((f) => f.endsWith(".json")).sort();
      expect(files).toEqual(NAMESPACES.map((n) => `${n}.json`).sort());
    }
  });

  for (const ns of NAMESPACES) {
    const en = flatten(load("en", ns));
    for (const locale of LOCALES.filter((l) => l !== "en")) {
      describe(`${locale}/${ns}`, () => {
        const other = flatten(load(locale, ns));

        it("has exactly the English keys", () => {
          expect(Object.keys(other).sort()).toEqual(Object.keys(en).sort());
        });

        it("has no empty values and keeps ICU placeholders", () => {
          for (const [key, value] of Object.entries(other)) {
            expect(value.trim(), `${locale}:${ns}.${key}`).not.toBe("");
            expect(placeholders(value), `${locale}:${ns}.${key}`).toEqual(placeholders(en[key] ?? ""));
          }
        });

        it("is translated, not copied from English", () => {
          const copied = Object.keys(other).filter(
            (key) => other[key] === en[key] && !SAME_IN_ALL_LOCALES.has(`${ns}.${key}`),
          );
          expect(copied).toEqual([]);
        });
      });
    }
  }

  it("uses the native script for Telugu and Hindi strings", () => {
    const te = Object.values(flatten(load("te", "public")));
    const hi = Object.values(flatten(load("hi", "public")));
    expect(te.every((s) => /[\u0C00-\u0C7F]/.test(s) || /^[\d\s.:·]+$/.test(s))).toBe(true);
    expect(hi.every((s) => /[\u0900-\u097F]/.test(s) || /^[\d\s.:·]+$/.test(s))).toBe(true);
  });
  it("has no values that look like raw message keys", () => {
    const rawKey = new RegExp(`^(${NAMESPACES.join("|")})(\\.[A-Za-z_]+)+$`);
    for (const locale of LOCALES) {
      for (const ns of NAMESPACES) {
        for (const [key, value] of Object.entries(flatten(load(locale, ns)))) {
          expect(rawKey.test(value.trim()), `${locale}:${ns}.${key} = "${value}"`).toBe(false);
        }
      }
    }
  });

  it("resolves every full message key used in source (module labelKeys) in English", () => {
    const en: Record<string, unknown> = Object.fromEntries(NAMESPACES.map((ns) => [ns, load("en", ns)]));
    const resolves = (key: string) =>
      key.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), en) !== undefined;
    // Full keys handed to a root translator: `labelKey: "payment.status.due"` and `*_KEY = "common.status.unknown"`.
    const literal = new RegExp(`(?:labelKey\\s*:|_KEY\\s*=)\\s*["'\`]((?:${NAMESPACES.join("|")})\\.[A-Za-z_]+(?:\\.[A-Za-z_]+)+)["'\`]`, "g");
    const missing: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) {
          for (const m of readFileSync(full, "utf8").matchAll(literal)) {
            if (!resolves(m[1])) missing.push(`${path.relative(SRC, full)}: ${m[1]}`);
          }
        }
      }
    };
    walk(SRC);
    expect(missing).toEqual([]);
  });
});
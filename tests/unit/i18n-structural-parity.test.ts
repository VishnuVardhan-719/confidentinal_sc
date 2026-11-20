import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural parity of every message namespace (docs/frontend/I18N_GLOSSARY.md):
 * te and hi have exactly the English key set, and every message uses the same ICU arguments
 * ({name}, {count, plural, ...}) and rich-text tags (<b>...</b>) as English.
 *
 * Deliberately structural only. It does not judge wording or terminology (the glossary does), and
 * plural branches may differ per locale (Hindi needs `=0`, see i18n-hindi-plurals.test.ts).
 * Namespaces are discovered from disk, so a new namespace is covered without editing this file.
 * I18N_PARITY_DIR can point at another messages folder (e.g. an integration export).
 */

type Tree = { [k: string]: string | Tree };
const LOCALES = ["en", "te", "hi"] as const;
const DIR = process.env.I18N_PARITY_DIR ?? path.resolve(import.meta.dirname, "../../src/messages");

function flatten(tree: Tree, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else flatten(v, key, out);
  }
  return out;
}

/**
 * ICU argument names (`{name}`, `{count, plural, ...}`, arguments nested in branches) and rich-text
 * tag names. A small scanner, so plural/select branch text such as `one {day}` is not mistaken
 * for an argument.
 */
function placeholders(message: string): string[] {
  const found = new Set<string>();
  const isSpace = (c: string | undefined) => c !== undefined && /\s/.test(c);
  const readWord = (i: number): [string, number] => {
    let j = i;
    while (j < message.length && !/[\s,{}]/.test(message[j])) j++;
    return [message.slice(i, j), j];
  };
  const skipSpace = (i: number) => {
    while (isSpace(message[i])) i++;
    return i;
  };
  // Message text until the closing brace of the current branch (or the end). Returns the index after it.
  const text = (i: number): number => {
    while (i < message.length) {
      if (message[i] === "{") i = argument(i + 1);
      else if (message[i] === "}") return i + 1;
      else i++;
    }
    return i;
  };
  // After "{": name [, type [, style | options]] "}".
  const argument = (i: number): number => {
    const [name, afterName] = readWord(skipSpace(i));
    if (name) found.add(`{${name}}`);
    let j = skipSpace(afterName);
    if (message[j] !== ",") return message[j] === "}" ? j + 1 : j;
    const [type, afterType] = readWord(skipSpace(j + 1));
    j = skipSpace(afterType);
    if (message[j] === "}") return j + 1;
    if (!["plural", "select", "selectordinal"].includes(type)) {
      // number/date/time style: skip to the matching brace.
      for (let depth = 1, k = j + 1; k < message.length; k++) {
        if (message[k] === "{") depth++;
        else if (message[k] === "}" && --depth === 0) return k + 1;
      }
      return message.length;
    }
    j++; // past the comma before the options
    while (j < message.length) {
      j = skipSpace(j);
      if (message[j] === "}") return j + 1;
      const [, afterSelector] = readWord(j);
      j = skipSpace(afterSelector);
      if (message[j] === "{") j = text(j + 1);
      else if (afterSelector === j) j++;
    }
    return j;
  };
  text(0);
  for (const m of message.matchAll(/<([A-Za-z][\w-]*)>/g)) found.add(`<${m[1]}>`);
  return [...found].sort();
}

const load = (locale: string, file: string): Record<string, string> =>
  flatten(JSON.parse(readFileSync(path.join(DIR, locale, file), "utf8")) as Tree);

const NAMESPACES = readdirSync(path.join(DIR, "en"))
  .filter((f) => f.endsWith(".json"))
  .sort();

describe("placeholders()", () => {
  it("finds arguments, nested arguments and tags, but not plural branch text or #", () => {
    expect(placeholders("{count, plural, =0 {none} one {# day} other {# days in {city}}}")).toEqual(["{city}", "{count}"]);
    expect(placeholders("{role, select, doctor {Doctor} other {{label}}} on {when, date, medium}")).toEqual(["{label}", "{role}", "{when}"]);
    expect(placeholders("Hello {name}, read the <link>terms</link>")).toEqual(["<link>", "{name}"]);
    expect(placeholders("No arguments here")).toEqual([]);
  });

  it("tells a missing or renamed argument apart", () => {
    expect(placeholders("{count, plural, one {# test} other {# tests}}")).not.toEqual(placeholders("{n, plural, one {# test} other {# tests}}"));
    expect(placeholders("Hi {name}")).not.toEqual(placeholders("Hi"));
  });
});

describe("message namespaces", () => {
  it("exist", () => {
    expect(NAMESPACES.length).toBeGreaterThan(0);
  });

  it("are present in every locale", () => {
    for (const locale of LOCALES) {
      const missing = NAMESPACES.filter((f) => !existsSync(path.join(DIR, locale, f)));
      expect(missing, `${locale} is missing namespaces`).toEqual([]);
      const extra = readdirSync(path.join(DIR, locale)).filter((f) => f.endsWith(".json") && !NAMESPACES.includes(f));
      expect(extra, `${locale} has namespaces English does not`).toEqual([]);
    }
  });
});

describe.each(NAMESPACES)("%s", (file) => {
  const en = load("en", file);

  it.each(["te", "hi"] as const)("%s has exactly the English keys", (locale) => {
    const other = load(locale, file);
    const missing = Object.keys(en).filter((k) => !(k in other));
    const extra = Object.keys(other).filter((k) => !(k in en));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it.each(["te", "hi"] as const)("%s uses the same ICU arguments and tags as English", (locale) => {
    const other = load(locale, file);
    const mismatched = Object.keys(en)
      .filter((k) => k in other)
      .filter((k) => placeholders(en[k]).join() !== placeholders(other[k]).join())
      .map((k) => `${k}: en ${placeholders(en[k]).join(" ") || "-"} / ${locale} ${placeholders(other[k]).join(" ") || "-"}`);
    expect(mismatched).toEqual([]);
  });
});

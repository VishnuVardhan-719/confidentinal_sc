import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * R9-E7 date/time guard. Times are stored in UTC and shown in Asia/Kolkata, whatever the server or
 * browser zone is. Fails on new code that reads or prints a time in the machine's zone:
 *   - toLocaleDateString / toLocaleTimeString / toLocaleString (machine zone, machine locale)
 *   - local-time getters (getHours, getMinutes, getDate, getDay, getMonth, getFullYear) and toDateString
 *   - an Intl.DateTimeFormat constructed without a timeZone
 *   - toISOString().slice/split/substring, which yields the UTC day, not the IST day, unless the line
 *     shifts by the IST offset first (330 * 60_000 or IST_OFFSET_MS)
 * It also requires the next-intl request config to default to Asia/Kolkata, which every
 * format.dateTime call without an explicit zone relies on.
 */

const ROOT = process.env.TIME_GUARD_SRC ?? path.resolve(import.meta.dirname, "../../src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name) ? [full] : [];
  });
}

const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join("/");
const files = sourceFiles(ROOT).map((file) => ({ file: rel(file), lines: readFileSync(file, "utf8").split(/\r?\n/) }));

const MACHINE_ZONE = /\.toLocale(Date|Time)?String\(|\.(getHours|getMinutes|getDate|getDay|getMonth|getFullYear)\(\)|\.toDateString\(/;
const UTC_DAY_SLICE = /\.toISOString\(\)\s*\.(slice|split|substring)\(/;
const IST_SHIFT = /330\s*\*\s*60_?000|IST_OFFSET/;

function offenders(test: (line: string, lines: string[], index: number) => boolean): string[] {
  return files.flatMap(({ file, lines }) =>
    lines.flatMap((line, index) => (!line.trim().startsWith("//") && !line.trim().startsWith("*") && test(line, lines, index) ? [`${file}:${index + 1}: ${line.trim().slice(0, 100)}`] : [])),
  );
}

describe("date and time guard", () => {
  it("finds the sources", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it("nothing reads or prints a time in the machine zone", () => {
    expect(offenders((line) => MACHINE_ZONE.test(line))).toEqual([]);
  });

  it("every Intl.DateTimeFormat names its timeZone", () => {
    expect(
      offenders((line, lines, index) => {
        if (!/new Intl\.DateTimeFormat\(/.test(line)) return false;
        // The options object can wrap onto the next few lines.
        return !/timeZone/.test(lines.slice(index, index + 4).join("\n"));
      }),
    ).toEqual([]);
  });

  it("a UTC day string is never used as an IST day", () => {
    expect(offenders((line) => UTC_DAY_SLICE.test(line) && !IST_SHIFT.test(line))).toEqual([]);
  });

  it("the default zone for next-intl formatting is Asia/Kolkata", () => {
    const request = path.join(ROOT, "i18n/request.ts");
    expect(existsSync(request)).toBe(true);
    expect(readFileSync(request, "utf8")).toMatch(/timeZone:\s*["']Asia\/Kolkata["']/);
  });

  it("the guard itself catches what it claims to", () => {
    expect(MACHINE_ZONE.test("d.toLocaleDateString()")).toBe(true);
    expect(MACHINE_ZONE.test("d.getHours()")).toBe(true);
    expect(UTC_DAY_SLICE.test("new Date().toISOString().slice(0, 10)")).toBe(true);
    expect(IST_SHIFT.test("new Date(Date.parse(utc) + 330 * 60_000).toISOString().slice(0, 10)")).toBe(true);
    expect(MACHINE_ZONE.test("new Intl.DateTimeFormat(tag, { timeZone: TIME_ZONE })")).toBe(false);
  });
});

/*
 * Static guards over src/: cheap checks that fail CI when a known-dangerous pattern is introduced.
 * They are not a substitute for review; each failure should be read, not silenced.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(import.meta.dirname, "../../src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx|js|jsx|mjs)$/.test(name) ? [full] : [];
  });
}

const sources = files(SRC).map((file) => ({
  file: path.relative(SRC, file),
  text: readFileSync(file, "utf8"),
}));

function offenders(pattern: RegExp, filter: (s: { text: string }) => boolean = () => true): string[] {
  return sources.filter((s) => filter(s) && pattern.test(s.text)).map((s) => s.file);
}

const isClient = (s: { text: string }) => /^\s*["']use client["']/m.test(s.text);

describe("source security guards", () => {
  it("finds source files to scan", () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it("has no raw HTML injection or dynamic code execution", () => {
    expect(offenders(/dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|\beval\(|new Function\(/)).toEqual([]);
  });

  it("opens no new tab without rel=noopener noreferrer", () => {
    const bad = sources
      .filter((s) => /target=["{]\s*["']?_blank/.test(s.text))
      .filter((s) => !/rel=["'][^"']*noopener[^"']*noreferrer|rel=["'][^"']*noreferrer[^"']*noopener/.test(s.text))
      .map((s) => s.file);
    expect(bad).toEqual([]);
  });

  it("never references the service-role key from client components", () => {
    expect(offenders(/SERVICE_ROLE|service_role/i, isClient)).toEqual([]);
  });

  it("reads only allow-listed NEXT_PUBLIC_ variables (these ship to the browser)", () => {
    const allowed = new Set(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
    const used = new Set(sources.flatMap((s) => s.text.match(/NEXT_PUBLIC_[A-Z0-9_]+/g) ?? []));
    expect([...used].filter((name) => !allowed.has(name))).toEqual([]);
  });

  it("contains no hard-coded JWTs or live payment/API keys", () => {
    expect(offenders(/eyJhbGciOi[A-Za-z0-9_-]{10,}|sk_live_|rzp_live_|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----/)).toEqual([]);
  });

  it("does not build javascript: URLs", () => {
    expect(offenders(/["'`]javascript:/i)).toEqual([]);
  });
});

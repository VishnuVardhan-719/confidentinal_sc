import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** WCAG 2.x contrast for every text/surface pairing the components actually use. */
const css = readFileSync(path.resolve(import.meta.dirname, "../../src/styles/tokens.css"), "utf8");
const tokens = Object.fromEntries([...css.matchAll(/--scv-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_AA = 4.5;
const NON_TEXT = 3; // UI component boundaries, focus indicators, large text

const textPairs: [fg: string, bg: string][] = [
  ["ink", "paper"],
  ["ink", "surface"],
  ["ink", "mist"],
  ["ink", "paper-deep"],
  ["text-muted", "paper"],
  ["text-muted", "surface"],
  ["text-muted", "mist"],
  ["text-muted", "paper-deep"],
  ["forest", "paper"],
  ["forest", "surface"],
  ["forest", "mist"],
  ["text-on-forest", "forest"],
  ["text-on-forest", "forest-strong"],
  ["text-on-forest-muted", "forest"],
  ["text-on-forest-muted", "forest-strong"],
  ["forest", "paper"], // onForest button text on paper fill
  ["warning-text", "warning-surface"],
  ["warning-text", "paper"],
  ["danger", "danger-surface"],
  ["danger", "paper"],
  ["danger", "surface"],
  ["surface", "danger"], // white on danger button
  ["success", "success-surface"],
  ["success", "surface"],
  ["info", "info-surface"],
  ["disabled-text", "disabled-surface"],
  ["ink", "selection"],
];

const nonTextPairs: [fg: string, bg: string][] = [
  ["focus", "paper"],
  ["focus", "surface"],
  ["border-strong", "surface"], // input borders
  ["border-strong", "paper"],
  ["forest", "mist"], // selected radio card outline
];

describe("design token contrast (WCAG AA)", () => {
  it("parses the base palette from DESIGN.md", () => {
    expect(tokens).toMatchObject({
      forest: "#0f5f59",
      teal: "#0a857c",
      ink: "#17282b",
      paper: "#faf8f2",
      mist: "#e9f3f0",
      warning: "#b36d20",
    });
  });

  it.each(textPairs)("text %s on %s >= 4.5:1", (fg, bg) => {
    expect(tokens[fg], fg).toBeDefined();
    expect(tokens[bg], bg).toBeDefined();
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(TEXT_AA);
  });

  it.each(nonTextPairs)("non-text %s on %s >= 3:1", (fg, bg) => {
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(NON_TEXT);
  });

  it("documents that raw warning and focus teal are not body-text colours on paper", () => {
    expect(contrast(tokens.warning, tokens.paper)).toBeLessThan(TEXT_AA);
    expect(contrast(tokens.teal, tokens.paper)).toBeLessThan(TEXT_AA);
  });
});

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import hiAmbulance from "@/messages/hi/ambulance.json";
import hiAuth from "@/messages/hi/auth.json";
import hiLab from "@/messages/hi/lab.json";

/**
 * CLDR puts 0 in the Hindi `one` category (unlike en and te), so `one {1 ...}` renders "1" for a
 * count of 0 (ADVERSARIAL_REVIEW finding 4, REQUESTS R-FE-Q-R9C3-1). A Hindi `one` branch must use
 * `#`, or the message must give 0 its own `=0` case.
 */

type Tree = { [k: string]: string | Tree };
const HI_DIR = path.resolve(import.meta.dirname, "../../src/messages/hi");

// Owned by fe-a; the patch is proposed in REQUESTS R-FE-Q-R9C3-1. Delete this line once applied.
const EXEMPT = new Set(["common.errorSummary.title"]);

function flatten(tree: Tree, prefix: string, out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(tree)) {
    const key = `${prefix}.${k}`;
    if (typeof v === "string") out[key] = v;
    else flatten(v, key, out);
  }
  return out;
}

/** The text of every `one {...}` branch (one level of nested braces is enough for these messages). */
const oneBranches = (msg: string) => [...msg.matchAll(/\bone\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map((m) => m[1]);

describe("Hindi plural `one` branches", () => {
  const all: Record<string, string> = {};
  for (const file of readdirSync(HI_DIR).filter((f) => f.endsWith(".json"))) {
    flatten(JSON.parse(readFileSync(path.join(HI_DIR, file), "utf8")) as Tree, file.replace(/\.json$/, ""), all);
  }

  it("use # or have an explicit =0 case", () => {
    const bad = Object.entries(all)
      .filter(([key, msg]) => !EXEMPT.has(key) && /\bplural\b/.test(msg) && !/=0\s*\{/.test(msg))
      .filter(([, msg]) => oneBranches(msg).some((branch) => !branch.includes("#")))
      .map(([key]) => key);
    expect(bad).toEqual([]);
  });

  it("the exemption list only names messages that still need it", () => {
    for (const key of EXEMPT) {
      expect(all[key], key).toBeDefined();
      expect(oneBranches(all[key]).some((b) => !b.includes("#")), `${key} is fixed: remove it from EXEMPT`).toBe(true);
    }
  });
});

describe("Hindi counts render the real number", () => {
  const t = (namespace: "ambulance" | "auth" | "lab", messages: object) =>
    createTranslator({ locale: "hi", messages: { [namespace]: messages }, namespace }) as unknown as (
      key: string,
      values: { count: number },
    ) => string;

  it("licence expiring today does not read as one day left", () => {
    const tr = t("ambulance", hiAmbulance);
    expect(tr("dashboard.daysLeft", { count: 0 })).toBe("आज समाप्त");
    expect(tr("dashboard.daysLeft", { count: 1 })).toBe("1 दिन बाकी");
    expect(tr("dashboard.daysLeft", { count: 5 })).toBe("5 दिन बाकी");
  });

  it("no OTP attempts left does not read as one attempt left", () => {
    const tr = t("auth", hiAuth);
    expect(tr("otp.attemptsLeft", { count: 0 })).toBe("कोई प्रयास बाकी नहीं");
    expect(tr("otp.attemptsLeft", { count: 1 })).toBe("1 प्रयास बाकी");
    expect(tr("otp.attemptsLeft", { count: 3 })).toBe("3 प्रयास बाकी");
  });

  it("lab test count shows 0 for an empty order", () => {
    const tr = t("lab", hiLab);
    expect(tr("orders.testCount", { count: 0 })).toBe("0 जाँच");
    expect(tr("orders.testCount", { count: 1 })).toBe("1 जाँच");
    expect(tr("orders.testCount", { count: 2 })).toBe("2 जाँचें");
  });
});

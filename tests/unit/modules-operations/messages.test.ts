import { describe, expect, it } from "vitest";
import enAdmin from "@/messages/en/admin.json";
import enAmbulance from "@/messages/en/ambulance.json";
import enCaretaker from "@/messages/en/caretaker.json";
import enLab from "@/messages/en/lab.json";
import hiAdmin from "@/messages/hi/admin.json";
import hiAmbulance from "@/messages/hi/ambulance.json";
import hiCaretaker from "@/messages/hi/caretaker.json";
import hiLab from "@/messages/hi/lab.json";
import teAdmin from "@/messages/te/admin.json";
import teAmbulance from "@/messages/te/ambulance.json";
import teCaretaker from "@/messages/te/caretaker.json";
import teLab from "@/messages/te/lab.json";
import * as adminStatus from "@/modules/admin/status";
import * as ambulanceStatus from "@/modules/ambulance/status";
import * as auditStatus from "@/modules/audit/status";
import * as caretakerStatus from "@/modules/caretaker/status";
import * as contentStatus from "@/modules/content/status";
import * as labStatus from "@/modules/lab/status";

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}

const NAMESPACES = {
  lab: { en: enLab, te: teLab, hi: hiLab },
  ambulance: { en: enAmbulance, te: teAmbulance, hi: hiAmbulance },
  caretaker: { en: enCaretaker, te: teCaretaker, hi: hiCaretaker },
  admin: { en: enAdmin, te: teAdmin, hi: hiAdmin },
} as const;

const ALL_EN: Record<string, string> = Object.fromEntries(
  Object.entries(NAMESPACES).flatMap(([ns, l]) => Object.entries(flatten(l.en as Tree, ns))),
);

describe.each(Object.entries(NAMESPACES))("%s messages", (_ns, locales) => {
  const en = flatten(locales.en as Tree);
  it.each(["te", "hi"] as const)("%s has exactly the English keys with non-empty values", (loc) => {
    const other = flatten(locales[loc] as Tree);
    expect(Object.keys(other).sort()).toEqual(Object.keys(en).sort());
    for (const v of Object.values(other)) expect(v.trim().length).toBeGreaterThan(0);
  });

  it.each(["te", "hi"] as const)("%s values are translations, not English copies", (loc) => {
    const other = flatten(locales[loc] as Tree);
    // Words of 4+ Latin letters (outside {placeholders}) mean untranslated prose; acronyms like PIN are fine.
    const prose = (s: string) => /[A-Za-z]{4,}/.test(s.replace(/\{[^}]*\}/g, "").replace(/\b[A-Z]{2,}\b/g, ""));
    const copies = Object.entries(other).filter(([k, v]) => prose(en[k]) && v === en[k]).map(([k]) => k);
    expect(copies).toEqual([]);
  });

  it("placeholders match across locales", () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\s*[,}]/g)].map((m) => m[1]).sort();
    for (const loc of ["te", "hi"] as const) {
      const other = flatten(locales[loc] as Tree);
      for (const [k, v] of Object.entries(en)) expect([k, names(other[k] ?? "")]).toEqual([k, names(v)]);
    }
  });
});

describe("status label keys used by the module status maps exist", () => {
  const VALUES = [
    "", "unknown", "scheduled", "collecting", "collected", "processing_handoff", "collection_failed", "handoff_failed",
    "requested", "accepted", "declined", "expired", "cancelled", "no_show", "uploaded", "reviewed", "released",
    "pending", "verified", "rejected", "invited", "active", "disabled", "assigned", "en_route", "arrived", "picked_up",
    "destination_reached", "trip_interrupted", "basic_transport", "wheelchair_accessible", "stretcher_capable",
    "available", "unavailable", "started", "ended", "care_interrupted", "checked_in", "checked_out", "absent", "replaced",
    "companionship", "mobility_assistance", "meal_assistance", "personal_hygiene_assistance", "light_household_help",
    "escort_to_appointment", "hour", "day", "week", "month", "draft", "submitted", "under_review", "approved", "suspended",
    "proposed", "revoked", "not_initiated", "due", "processing", "paid", "partially_paid", "disputed", "refunded",
    "processed", "open", "provider_first_line", "escalated", "resolved", "closed", "low", "normal", "high", "safety",
    "revoked", "accepted", "in_preview", "published", "archived", "success", "denied", "conflict", "verification",
    "coverage", "booking", "membership", "content", "payment", "support", "security", "settings",
  ];
  const describers: [string, (v: unknown) => { labelKey: string }][] = [];
  for (const mod of [labStatus, ambulanceStatus, caretakerStatus, adminStatus, contentStatus, auditStatus]) {
    for (const [name, fn] of Object.entries(mod)) if (name.startsWith("describe") && typeof fn === "function") describers.push([name, fn as (v: unknown) => { labelKey: string }]);
  }
  const keys = new Set<string>();
  for (const [, fn] of describers) {
    for (const v of [...VALUES, true, false, null]) {
      try {
        keys.add(fn(v).labelKey);
      } catch {
        // describeLabOrder / describeQuote take other shapes; covered below
      }
    }
  }
  for (const s of ["scheduled", null]) for (const b of ["requested", "cancelled", "completed"]) keys.add(labStatus.describeLabOrder({ substate: s, bookingState: b }).labelKey);
  keys.add(ambulanceStatus.describeQuote(true).labelKey).add(ambulanceStatus.describeQuote(false).labelKey);

  it("every key a status map can return has an English message (for areas with pages built)", () => {
    const built = [...keys].filter((k) => k.startsWith("lab.") || k.startsWith("ambulance."));
    const missing = built.filter((k) => !(k in ALL_EN));
    expect(missing).toEqual([]);
    expect(built.length).toBeGreaterThan(20);
  });
});

describe("safety wording", () => {
  it("ambulance copy never shows an ETA, countdown or live tracking", () => {
    for (const loc of [enAmbulance, teAmbulance, hiAmbulance]) expect(JSON.stringify(loc)).not.toMatch(/\bETA\b|\b\d+\s*(min|mins|minutes)\b|arriving in|on the way|live (location|tracking)/i);
  });

  it("lab completion never says a report is ready", () => {
    for (const loc of [enLab]) expect(JSON.stringify(loc.status.collection)).not.toMatch(/report (is )?ready|results? (are )?available|delivered/i);
  });
});

import { describe, expect, it } from "vitest";
import { finderRedirectPath, validateFinder } from "@/components/public/finder";
import { LOCALITIES, resolveLocation } from "@/components/public/localities";

describe("resolveLocation", () => {
  it("takes a 6-digit PIN whole, in any digit script", () => {
    expect(resolveLocation("500081")).toEqual({ pin: "500081", label: "500081" });
    expect(resolveLocation(" ५००००१ ")).toEqual({ pin: "500001", label: "500001" });
  });
  it("rejects malformed PINs without truncating them", () => {
    for (const bad of ["012345", "50000", "5000019", "abc123", "", "   ", null, undefined]) expect(resolveLocation(bad as string), String(bad)).toBeNull();
  });
  it("turns a known locality into its PIN, ignoring case, spacing and punctuation", () => {
    expect(resolveLocation("Madhapur")).toEqual({ pin: "500081", label: "Madhapur" });
    expect(resolveLocation("  banjara   HILLS ")).toEqual({ pin: "500034", label: "Banjara Hills" });
    expect(resolveLocation("HITEC City")?.pin).toBe("500081");
    expect(resolveLocation("L.B. Nagar")?.pin).toBe("500074");
  });
  it("does not guess unknown places", () => {
    expect(resolveLocation("Atlantis")).toBeNull();
    expect(resolveLocation("<script>")).toBeNull();
    expect(resolveLocation("Atlantis 500081")).toBeNull();
  });
  it("lists every locality once with a valid PIN", () => {
    const names = LOCALITIES.map((l) => l.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const l of LOCALITIES) expect(l.pin).toMatch(/^[1-9][0-9]{5}$/);
  });
});

describe("finder with localities", () => {
  it("routes a locality to the directory by PIN", () => {
    expect(validateFinder({ pin: "Madhapur", service: "labTests" })).toEqual({ ok: true, href: "/lab-tests?pin=500081" });
    expect(finderRedirectPath("te", "Gachibowli", "doctors")).toBe("/te/doctors?pin=500032");
  });
  it("names the problem for an unknown place or an empty field", () => {
    expect(validateFinder({ pin: "Atlantis", service: "doctors" })).toEqual({ ok: false, errors: { pin: "pinInvalid" } });
    expect(validateFinder({ pin: "", service: "doctors" })).toEqual({ ok: false, errors: { pin: "pinRequired" } });
  });
});

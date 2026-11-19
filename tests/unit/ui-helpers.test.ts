import { describe, expect, it } from "vitest";
import { filterFaq, normalizeForSearch } from "@/components/public/faq";
import { finderHref, isValidPin, normalizePin, validateFinder } from "@/components/public/finder";
import { signupHref } from "@/components/public/routes";
import { alternatesFor, isIndexable, localizedPath } from "@/components/public/seo";
import { isActivePath } from "@/components/shared/nav-match";
import { errorMessageKey } from "@/components/shared/error-message";
import {
  formatIndianMobile,
  isCompleteOtp,
  isValidIndianMobile,
  normalizeIndianMobile,
  sanitizeOtp,
  toAsciiDigits,
} from "@/components/shared/input-format";
import { resolveStatus, type StatusDescriptor } from "@/components/shared/status";
import { cn } from "@/components/ui/cn";

describe("digits, phone and OTP", () => {
  it("maps Devanagari and Telugu digits to ASCII and drops everything else", () => {
    expect(toAsciiDigits("५००००१")).toBe("500001");
    expect(toAsciiDigits("౫౦౦౦౦౧")).toBe("500001");
    expect(toAsciiDigits("+91 98-76")).toBe("919876");
  });

  it("normalises pasted Indian mobile numbers", () => {
    expect(normalizeIndianMobile("+91 98765 43210")).toBe("9876543210");
    expect(normalizeIndianMobile("09876543210")).toBe("9876543210");
    expect(normalizeIndianMobile("98765-43210")).toBe("9876543210");
    expect(normalizeIndianMobile("987654321099")).toBe("987654321099");
  });

  it("validates mobile shape and formats for display", () => {
    expect(isValidIndianMobile("9876543210")).toBe(true);
    expect(isValidIndianMobile("5876543210")).toBe(false);
    expect(isValidIndianMobile("987654321")).toBe(false);
    expect(formatIndianMobile("9876543210")).toBe("98765 43210");
  });

  it("sanitises OTP paste to the expected length", () => {
    expect(sanitizeOtp("12 34 56 78")).toBe("123456");
    expect(sanitizeOtp("ab१२३", 4)).toBe("123");
    expect(isCompleteOtp("123456")).toBe(true);
    expect(isCompleteOtp("12345")).toBe(false);
  });
});

describe("PIN finder", () => {
  it("accepts only 6-digit PINs not starting with 0", () => {
    expect(isValidPin("500001")).toBe(true);
    expect(isValidPin("050001")).toBe(false);
    expect(isValidPin("50001")).toBe(false);
    expect(normalizePin(" 500 001 ")).toBe("500001");
  });

  it("routes each service to its directory with ?pin=", () => {
    expect(finderHref("doctors", "500001")).toBe("/doctors?pin=500001");
    expect(finderHref("labTests", "500001")).toBe("/lab-tests?pin=500001");
    expect(finderHref("ambulances", "110001")).toBe("/ambulances?pin=110001");
    expect(finderHref("caretakers", "530001")).toBe("/caretakers?pin=530001");
  });

  it("reports every missing or invalid field", () => {
    expect(validateFinder({ pin: "", service: "" })).toEqual({
      ok: false,
      errors: { pin: "pinRequired", service: "serviceRequired" },
    });
    expect(validateFinder({ pin: "012345", service: "doctors" })).toEqual({ ok: false, errors: { pin: "pinInvalid" } });
    expect(validateFinder({ pin: "500001", service: "pharmacy" })).toEqual({
      ok: false,
      errors: { service: "serviceRequired" },
    });
    expect(validateFinder({ pin: "५००००१", service: "labTests" })).toEqual({ ok: true, href: "/lab-tests?pin=500001" });
    expect(validateFinder({ pin: "5000019", service: "doctors" })).toEqual({ ok: false, errors: { pin: "pinInvalid" } });
  });
});

describe("FAQ search", () => {
  const entries = [
    { q: "Who sets the price?", a: "Each provider sets their own price." },
    { q: "ధరను ఎవరు నిర్ణయిస్తారు?", a: "ప్రతి ప్రొవైడర్ తమ ధరను తామే నిర్ణయిస్తారు." },
    { q: "कीमत कौन तय करता है?", a: "हर प्रदाता अपनी कीमत खुद तय करता है।" },
  ];

  it("returns everything for an empty query", () => {
    expect(filterFaq(entries, "   ")).toHaveLength(3);
  });

  it("matches case-insensitively and requires every term", () => {
    expect(filterFaq(entries, "PRICE")).toHaveLength(1);
    expect(filterFaq(entries, "price provider")).toHaveLength(1);
    expect(filterFaq(entries, "price refund")).toHaveLength(0);
  });

  it("matches Telugu and Hindi text", () => {
    expect(filterFaq(entries, "ధర")).toHaveLength(1);
    expect(filterFaq(entries, "कीमत")).toHaveLength(1);
    expect(normalizeForSearch("  A\n b ")).toBe("a b");
  });
});

describe("status resolution", () => {
  const map: Record<"active" | "pending", StatusDescriptor> = {
    active: { tone: "success", label: "Active" },
    pending: { tone: "warning", label: "Pending review" },
  };
  const fallback: StatusDescriptor = { tone: "neutral", label: "Unknown status" };

  it("returns the canonical descriptor for known statuses", () => {
    expect(resolveStatus(map, "active", fallback)).toEqual(map.active);
  });

  it("never shows an unknown or prototype-key status as active", () => {
    for (const s of ["approved", "ACTIVE", "toString", "__proto__", null, undefined]) {
      const r = resolveStatus(map, s, fallback);
      expect(r.tone).toBe("neutral");
      expect(r.label).toBe("Unknown status");
    }
  });
});

describe("error codes", () => {
  it("maps known API codes and falls back to generic", () => {
    expect(errorMessageKey("rate_limited")).toBe("rate_limited");
    expect(errorMessageKey("Internal Server Error: stack...")).toBe("generic");
    expect(errorMessageKey(undefined)).toBe("generic");
  });
});

describe("SEO and routing helpers", () => {
  it("builds locale-prefixed paths", () => {
    expect(localizedPath("te", "/")).toBe("/te");
    expect(localizedPath("hi", "/faq")).toBe("/hi/faq");
  });

  it("emits canonical and hreflang alternates for all locales", () => {
    expect(alternatesFor("te", "/about")).toEqual({
      canonical: "/te/about",
      languages: { en: "/en/about", te: "/te/about", hi: "/hi/about", "x-default": "/en/about" },
    });
  });

  it("indexes only production", () => {
    expect(isIndexable({ APP_ENV: "production" })).toBe(true);
    expect(isIndexable({ APP_ENV: "staging" })).toBe(false);
    expect(isIndexable({})).toBe(false);
  });

  it("builds provider signup links", () => {
    expect(signupHref("lab")).toBe("/signup?role=lab");
    expect(signupHref()).toBe("/signup");
  });

  it("matches active nav items by path segment", () => {
    expect(isActivePath("/patient/bookings/42", "/patient/bookings")).toBe(true);
    expect(isActivePath("/patient/bookingsx", "/patient/bookings")).toBe(false);
    expect(isActivePath("/patient/bookings", "/patient", true)).toBe(false);
  });

  it("merges classes, keeping the last conflicting utility and custom text sizes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-display", "text-ink")).toBe("text-display text-ink");
  });
});

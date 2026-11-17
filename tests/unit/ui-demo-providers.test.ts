import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEMO_LABEL, DEMO_PROVIDERS } from "@/lib/demo/data";
import { DemoBadge } from "@/app/categories/_components/demo-badge";
import {
  ANY,
  bookHref,
  cardsForCategory,
  categoryForProvider,
  filterCards,
  filterOptions,
  slotDays,
  toCard,
} from "@/app/categories/_components/demo-providers";

describe("demo provider cards", () => {
  it("maps each public category to its demo kind; caretaker has none yet", () => {
    expect(cardsForCategory("doctor").length).toBe(DEMO_PROVIDERS.filter((p) => p.kind === "doctor").length);
    expect(cardsForCategory("lab").every((c) => c.id.startsWith("demo-lab"))).toBe(true);
    expect(cardsForCategory("scheduled-ambulance").map((c) => c.id)).toEqual(["demo-amb-1"]);
    expect(cardsForCategory("caretaker")).toEqual([]);
    expect(cardsForCategory("not-a-category")).toEqual([]);
  });

  it("uses the lowest service price for 'from'", () => {
    const p = DEMO_PROVIDERS.find((x) => x.id === "demo-dr-1")!;
    expect(toCard(p).fromPaise).toBe(40000);
  });

  it("links every provider back to a real category page", () => {
    for (const p of DEMO_PROVIDERS) expect(categoryForProvider(p)).toBeDefined();
  });

  it("every demo provider name is visibly marked as demo", () => {
    for (const p of DEMO_PROVIDERS) expect(p.name).toMatch(/demo/i);
  });
});

describe("filters", () => {
  const cards = cardsForCategory("doctor");

  it("offers sorted unique cities and languages", () => {
    const o = filterOptions(cards);
    expect(o.cities).toEqual([...new Set(cards.map((c) => c.city))].sort());
    expect(new Set(o.languages).size).toBe(o.languages.length);
  });

  it("filters by city and language together, and ANY means no filter", () => {
    expect(filterCards(cards, { city: ANY, language: ANY })).toHaveLength(cards.length);
    const hyd = filterCards(cards, { city: "Hyderabad", language: ANY });
    expect(hyd.length).toBeGreaterThan(0);
    expect(hyd.every((c) => c.city === "Hyderabad")).toBe(true);
    const hydHindi = filterCards(cards, { city: "Hyderabad", language: "Hindi" });
    expect(hydHindi.every((c) => c.city === "Hyderabad" && c.languages.includes("Hindi"))).toBe(true);
    expect(filterCards(cards, { city: "Nowhere", language: ANY })).toEqual([]);
  });
});

describe("slots", () => {
  it("shows UTC slots in IST, grouped by IST day and sorted", () => {
    // 2026-12-02 04:30 UTC is 10:00 IST on 2 Dec; 2026-12-01 20:00 UTC is 01:30 IST on 2 Dec.
    const days = slotDays(["2026-12-02T04:30:00.000Z", "2026-12-01T20:00:00.000Z", "2026-12-03T09:00:00.000Z"]);
    expect(days.map((d) => d.dayKey)).toEqual(["2026-12-02", "2026-12-03"]);
    expect(days[0].slots.map((s) => s.time)).toEqual(["1:30 AM", "10:00 AM"]);
    expect(days[1].slots[0].time).toBe("2:30 PM");
  });

  it("skips invalid timestamps", () => {
    expect(slotDays(["not-a-date"])).toEqual([]);
  });
});

describe("booking link and badge", () => {
  it("carries only ids, never a price", () => {
    const href = bookHref("demo-dr-1", "s1", "2026-12-02T04:30:00.000Z");
    const u = new URL(href, "https://example.invalid");
    expect(u.pathname).toBe("/book");
    expect(Object.fromEntries(u.searchParams)).toEqual({ provider: "demo-dr-1", service: "s1", slot: "2026-12-02T04:30:00.000Z" });
    expect(href).not.toMatch(/price|paise|amount/i);
  });

  it("DemoBadge shows the shared demo label", () => {
    expect(renderToStaticMarkup(createElement(DemoBadge))).toContain(DEMO_LABEL);
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ButtonLink } from "@/components/button-link";
import { ServiceIndex } from "@/components/service-index";
import { categories } from "@/app/categories/data";
import { requestSteps } from "@/app/how-it-works/steps";

describe("ButtonLink", () => {
  it("is a link, not a button, so navigation stays a navigation", () => {
    const out = renderToStaticMarkup(createElement(ButtonLink, { href: "/categories" }, "Explore services"));
    expect(out).toMatch(/^<a [^>]*href="\/categories"/);
    expect(out).not.toContain("<button");
  });
});

describe("ServiceIndex", () => {
  it("renders one heading link per category at the requested level", () => {
    const out = renderToStaticMarkup(createElement(ServiceIndex, { items: categories, headingLevel: "h2" }));
    for (const c of categories) expect(out).toContain(`href="/categories/${c.slug}"`);
    expect(out.match(/<h2/g)).toHaveLength(categories.length);
    expect(out).toContain('aria-hidden="true"');
  });
});

describe("public copy guard", () => {
  const copy = JSON.stringify([categories, requestSteps]).toLowerCase();

  it("has the four approved categories", () => {
    expect(categories.map((c) => c.slug)).toEqual(["doctor", "lab", "scheduled-ambulance", "caretaker"]);
  });

  it("makes no price, rating, coverage, availability or payment claims", () => {
    const banned = [/₹/, /\brs\.?\s?\d/, /\brupees?\b/, /\bratings?\b/, /\bstars?\b/, /\btestimonials?\b/, /customer reviews?/,
      /\bverified\b/, /\bpaid\b/, /available now/, /\beta\b/, /\d+\s?min(ute)?s?\b/, /24\s?[/x]\s?7/, /near you/, /\bguarantee/];
    for (const re of banned) expect(copy, String(re)).not.toMatch(re);
  });

  it("keeps ambulance non-emergency and caretaker non-clinical", () => {
    const amb = JSON.stringify(categories.find((c) => c.slug === "scheduled-ambulance")).toLowerCase();
    expect(amb).toContain("not an emergency");
    const care = JSON.stringify(categories.find((c) => c.slug === "caretaker")).toLowerCase();
    expect(care).toContain("non-clinical");
  });
});

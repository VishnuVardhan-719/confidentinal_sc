import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeaderNav, ariaCurrentFor } from "@/components/nav-links";

describe("ariaCurrentFor", () => {
  it("marks an exact match as the current page", () => {
    expect(ariaCurrentFor("/how-it-works", "/how-it-works")).toBe("page");
    expect(ariaCurrentFor("/", "/")).toBe("page");
  });
  it("marks a parent section as current without claiming the page", () => {
    expect(ariaCurrentFor("/categories/doctor", "/categories")).toBe("true");
  });
  it("matches home only on the home page", () => {
    expect(ariaCurrentFor("/categories", "/")).toBeUndefined();
  });
  it("does not match a sibling path that shares a prefix", () => {
    expect(ariaCurrentFor("/categories-old", "/categories")).toBeUndefined();
  });
});

describe("HeaderNav", () => {
  const out = renderToStaticMarkup(
    createElement(HeaderNav, { items: [{ href: "/", label: "Home" }], label: "Main" }),
  );

  it("renders a collapsed disclosure button wired to the panel", () => {
    expect(out).toMatch(/<button[^>]*type="button"/);
    expect(out).toContain('aria-expanded="false"');
    const controls = /aria-controls="([^"]+)"/.exec(out)?.[1];
    expect(controls).toBeTruthy();
    expect(out).toContain(`id="${controls}"`);
    expect(out).toContain('data-open="false"');
  });
  it("keeps a labelled nav landmark and a no-JS fallback", () => {
    expect(out).toContain('aria-label="Main"');
    expect(out).toContain("<noscript>");
  });
});

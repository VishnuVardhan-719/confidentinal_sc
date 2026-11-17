import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, fieldErrors } from "@/components/ui/form-field";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe("Button", () => {
  it("defaults to type=button and is a real button", () => {
    expect(html(createElement(Button, null, "Go"))).toMatch(/<button[^>]*type="button"/);
  });
  it("disables and marks busy while loading", () => {
    const out = html(createElement(Button, { loading: true }, "Save"));
    expect(out).toContain("disabled");
    expect(out).toContain('aria-busy="true"');
  });
});

describe("FormField", () => {
  it("links label, hint and error to the control", () => {
    const out = html(
      createElement(FormField, { label: "Phone", hint: "10 digits", error: "Too short", required: true }, createElement(Input)),
    );
    const id = /for="([^"]+)"/.exec(out)?.[1];
    expect(id).toBeTruthy();
    expect(out).toContain(`id="${id}"`);
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain(`aria-describedby="${id}-hint ${id}-error"`);
    expect(out).toContain('role="alert"');
  });
  it("shows no error markup when valid", () => {
    const out = html(createElement(FormField, { label: "Name" }, createElement(Input)));
    expect(out).not.toContain("alert");
    expect(out).not.toContain("aria-invalid");
  });
  it("maps Zod issues to the first message per field", () => {
    const r = z.object({ name: z.string().min(2, "Name is too short") }).safeParse({ name: "a" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error)).toEqual({ name: "Name is too short" });
  });
});

describe("state components", () => {
  it("Loading is a polite status", () => {
    expect(html(createElement(Loading))).toContain('role="status"');
  });
  it("ErrorState is an alert with optional retry", () => {
    expect(html(createElement(ErrorState, { message: "x" }))).toContain('role="alert"');
    expect(html(createElement(ErrorState, { onRetry: () => {} }))).toContain("Try again");
  });
  it("EmptyState renders title, message and action", () => {
    const out = html(
      createElement(EmptyState, { title: "Nothing yet", message: "m", action: createElement("a", { href: "/" }, "Home") }),
    );
    expect(out).toContain("Nothing yet");
    expect(out).toContain("Home");
  });
});

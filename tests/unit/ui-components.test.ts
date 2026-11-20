import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
    expect(out).not.toMatch(/\saria-invalid=/);
  });
  it("maps Zod issues to the first message per field", () => {
    const r = z.object({ name: z.string().min(2, "Name is too short") }).safeParse({ name: "a" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error)).toEqual({ name: "Name is too short" });
  });
  it("wires a native select with standard attributes only", () => {
    const out = html(
      createElement(
        FormField,
        { label: "City", error: "Pick one" },
        createElement("select", { id: "city", "aria-describedby": "city-note", required: true }),
      ),
    );
    expect(out).not.toMatch(/\sinvalid=/);
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain('for="city"');
    expect(out).toContain('id="city"');
    expect(out).toContain('aria-describedby="city-note city-error"');
    expect(out).toMatch(/<select[^>]*required/);
  });
});

describe("Input", () => {
  it("uses the 3:1 control border token and an aria-invalid error style", () => {
    const out = html(createElement(Input, { invalid: true }));
    expect(out).toContain("border-[var(--input-border)]");
    expect(out).toContain("aria-invalid:border-[var(--warning)]");
    expect(out).toContain('aria-invalid="true"');
  });
});

describe("cn and buttonVariants", () => {
  it("lets a caller's class override the base padding", () => {
    expect(cn(buttonVariants(), "px-2")).not.toMatch(/\bpx-5\b/);
    expect(cn(buttonVariants(), "px-2")).toMatch(/\bpx-2\b/);
  });
  it("keeps the focus outline width and colour together", () => {
    const c = cn(buttonVariants({ variant: "secondary" }));
    expect(c).toContain("focus-visible:outline-[3px]");
    expect(c).toContain("focus-visible:outline-[var(--focus)]");
  });
  it("quiet variant stays underlined", () => {
    expect(cn(buttonVariants({ variant: "quiet" }))).not.toContain("no-underline");
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
  it("state headings follow the requested level", () => {
    expect(html(createElement(EmptyState, { title: "t", headingLevel: "h3" }))).toMatch(/^<div[^>]*><h3/);
    expect(html(createElement(ErrorState, { headingLevel: "h4" }))).toContain("<h4");
    expect(html(createElement(ErrorState, {}))).toContain("<h2");
  });
});

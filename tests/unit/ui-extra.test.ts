import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const option = (value: string, label: string) => createElement("option", { key: value, value }, label);

/** FormField label `for` must point at the control's id, and hint/error must describe it. */
function expectWired(out: string, tag: "textarea" | "select") {
  const id = /for="([^"]+)"/.exec(out)?.[1];
  expect(id).toBeTruthy();
  const control = new RegExp(`<${tag}[^>]*>`).exec(out)?.[0] ?? "";
  expect(control).toContain(`id="${id}"`);
  expect(control).toContain(`aria-describedby="${id}-hint ${id}-error"`);
  expect(control).toContain('aria-invalid="true"');
  expect(control).toContain("required");
  expect(out).toContain('role="alert"');
}

describe("Textarea", () => {
  it("is wired by FormField like Input", () => {
    const out = html(
      createElement(FormField, { label: "Notes", hint: "Optional", error: "Too long", required: true }, createElement(Textarea)),
    );
    expectWired(out, "textarea");
  });
  it("defaults to 4 rows and carries no invalid state when valid", () => {
    const out = html(createElement(FormField, { label: "Notes" }, createElement(Textarea)));
    expect(out).toContain('rows="4"');
    expect(out).not.toContain("aria-invalid");
  });
});

describe("Select", () => {
  it("is wired by FormField like Input", () => {
    const out = html(
      createElement(
        FormField,
        { label: "City", hint: "Where the visit happens", error: "Choose a city", required: true },
        createElement(Select, { placeholder: "Choose a city" }, option("hyd", "Hyderabad")),
      ),
    );
    expectWired(out, "select");
  });
  it("removes native styling and draws a decorative chevron", () => {
    const out = html(createElement(Select, null, option("a", "A")));
    expect(out).toMatch(/<select[^>]*class="[^"]*appearance-none/);
    expect(out).toMatch(/<svg[^>]*aria-hidden="true"/);
  });
  it("renders the placeholder as an empty-value first option", () => {
    const out = html(createElement(Select, { placeholder: "Choose" }, option("a", "A")));
    expect(out).toMatch(/<select[^>]*><option value="">Choose<\/option><option value="a">/);
  });
  it("drops the chevron and placeholder for list boxes", () => {
    const out = html(createElement(Select, { multiple: true, placeholder: "Choose" }, option("a", "A")));
    expect(out).not.toContain("<svg");
    expect(out).not.toContain('value=""');
  });
});

describe("Skeleton", () => {
  it("is hidden from assistive technology even if a caller tries to expose it", () => {
    const out = html(createElement(Skeleton, { "aria-hidden": false, className: "h-6 w-48" }));
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain("h-6 w-48");
  });
  it("stops pulsing under reduced motion", () => {
    expect(html(createElement(Skeleton))).toContain("motion-reduce:animate-none");
  });
});

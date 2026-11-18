// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { createElement, useState, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import accessibility from "@/messages/en/accessibility.json";
import common from "@/messages/en/common.json";
import errors from "@/messages/en/errors.json";
import type { FaqEntry } from "@/components/public/faq";
import { FaqSearch } from "@/components/public/faq-search";
import { ErrorSummary } from "@/components/shared/error-summary";
import { Field } from "@/components/shared/field";
import { InlineError } from "@/components/shared/inline-error";
import { OTPInput } from "@/components/shared/otp-input";
import { StatusBadge } from "@/components/shared/status-badge";

afterEach(cleanup);

const h = createElement;
const withIntl = (ui: ReactNode) =>
  h(NextIntlClientProvider, { locale: "en", messages: { common, accessibility, errors }, timeZone: "Asia/Kolkata", children: ui });

describe("StatusBadge", () => {
  it("renders text alongside the icon (colour is not the only signal)", () => {
    render(h(StatusBadge, { tone: "warning", label: "Pending review" }));
    const badge = screen.getByText("Pending review");
    expect(badge.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("InlineError", () => {
  it("shows the localized message for an API code, never raw server text", () => {
    render(withIntl(h(InlineError, { code: "TypeError: secret stack" })));
    expect(screen.getByRole("alert").textContent).toContain(errors.api.generic);
    expect(screen.getByRole("alert").textContent).not.toContain("secret");
  });
});

describe("Field", () => {
  it("links hint and error to the control and marks it invalid", () => {
    render(
      withIntl(
        h(Field, {
          id: "name",
          label: "Full name",
          hint: "As on your ID",
          error: "Enter your name",
          required: true,
          children: (p) => h("input", p),
        }),
      ),
    );
    const input = screen.getByLabelText("Full name");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("name-error name-hint");
  });
});

describe("ErrorSummary", () => {
  it("takes focus and links each error to its field", () => {
    render(withIntl(h(ErrorSummary, { errors: [{ fieldId: "pin", message: "Enter your PIN" }], focusKey: 1 })));
    const summary = screen.getByRole("alert");
    expect(document.activeElement).toBe(summary);
    expect(summary.textContent).toContain("Fix 1 problem to continue");
    expect(screen.getByRole("link", { name: "Enter your PIN" }).getAttribute("href")).toBe("#pin");
  });
});

describe("OTPInput", () => {
  function Harness() {
    const [v, setV] = useState("");
    return h("div", null, h("label", { htmlFor: "otp" }, "Code"), h(OTPInput, { id: "otp", value: v, onValueChange: setV }));
  }

  it("is one real input that sanitises pasted text", () => {
    render(h(Harness));
    const input = screen.getByLabelText("Code") as HTMLInputElement;
    expect(input.getAttribute("autocomplete")).toBe("one-time-code");
    fireEvent.change(input, { target: { value: "12 34-56 99" } });
    expect(input.value).toBe("123456");
  });
});

describe("FaqSearch", () => {
  const entries: FaqEntry[] = [
    { id: "price", category: "payments", q: "Who sets the price?", a: "Each provider." },
    { id: "coverage", category: "services", q: "Which areas do you cover?", a: "Only served PIN codes." },
  ];
  const labels = {
    searchLabel: "Search questions",
    searchHint: "Type a word",
    results: { zero: "No questions match", one: "1 question matches", other: "# questions match" },
    noResultsTitle: "No matching questions",
    noResultsBody: "Try another word",
    clear: "Clear search",
    categories: { services: "Services", booking: "Bookings", payments: "Payments", account: "Account", providers: "Providers" },
  };

  it("filters questions, announces the count and shows an empty state", async () => {
    render(h(FaqSearch, { entries, labels }));
    const input = screen.getByLabelText("Search questions");
    expect(document.querySelectorAll("details")).toHaveLength(2);
    await act(async () => fireEvent.change(input, { target: { value: "price" } }));
    expect(document.querySelectorAll("details")).toHaveLength(1);
    expect(screen.getByText("1 question matches")).toBeTruthy();
    await act(async () => fireEvent.change(input, { target: { value: "zzz" } }));
    expect(screen.getByText("No matching questions")).toBeTruthy();
  });
});

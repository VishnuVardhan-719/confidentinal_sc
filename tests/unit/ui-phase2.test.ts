// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { createElement, useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import accessibility from "@/messages/en/accessibility.json";
import common from "@/messages/en/common.json";
import errors from "@/messages/en/errors.json";
import payment from "@/messages/en/payment.json";
import support from "@/messages/en/support.json";
import { CancellationDialog, isCancellationReady } from "@/components/payments/cancellation-dialog";
import { InvoiceLink, ReceiptLink } from "@/components/payments/document-link";
import { formatPaise, isSafeDocumentHref, isValidPaise } from "@/components/payments/money";
import { PaymentSummary, type PaymentSummaryView } from "@/components/payments/payment-summary";
import { NotificationList } from "@/components/notifications/notification-list";
import { applyReadState, isInternalPath } from "@/components/notifications/notifications";
import { ErrorSummary } from "@/components/shared/error-summary";
import { GateNotice } from "@/components/shared/gate-notice";
import { isValidIndianMobile, normalizeIndianMobile, sanitizeOtp, toAsciiDigits } from "@/components/shared/input-format";
import { PhoneInput } from "@/components/shared/phone-input";
import { DEFAULT_ICON_FOR_TONE, STATUS_TONES, toStatusDescriptor, type StatusTranslator } from "@/components/shared/status";
import { KeyedStatusBadge, StatusBadge } from "@/components/shared/status-badge";
import { Stepper } from "@/components/shared/stepper";
import { viewFromResult } from "@/components/shared/view-state";
import { SupportTicketForm } from "@/components/support/support-ticket-form";
import { looksSensitive, validateTicket } from "@/components/support/ticket";
import { TicketTimeline } from "@/components/support/ticket-timeline";
import { richTextToPlain } from "@/components/public/rich-text";

afterEach(cleanup);

const h = createElement;
const messages = { common, accessibility, errors, payment, support };
const withIntl = (ui: ReactNode) => h(NextIntlClientProvider, { locale: "en", messages, timeZone: "Asia/Kolkata", children: ui });

const fakeT: StatusTranslator = Object.assign((key: string) => `T(${key})`, { has: (key: string) => key.startsWith("payment.status.") });

describe("XREVIEW X1/A1: shared status tones", () => {
  it("includes the progress tone used by the clinical/doctor/records modules", () => {
    expect(STATUS_TONES).toEqual(expect.arrayContaining(["neutral", "info", "progress", "success", "warning", "danger"]));
    render(h(StatusBadge, { tone: "progress", label: "En route" }));
    expect(screen.getByText("En route").className).toContain("bg-mist");
  });

  it("does not give brand a verified-looking shield by default", () => {
    expect(DEFAULT_ICON_FOR_TONE.brand).not.toBe("shield");
    expect(DEFAULT_ICON_FOR_TONE.progress).toBe("progress");
  });

  it("maps module presentations to badges and fails closed on unknown tones or keys", () => {
    expect(toStatusDescriptor({ labelKey: "payment.status.due", tone: "warning" }, fakeT)).toMatchObject({ tone: "warning", label: "T(payment.status.due)" });
    expect(toStatusDescriptor({ labelKey: "payment.status.paid", tone: "verified-gold" }, fakeT)).toMatchObject({ tone: "neutral" });
    expect(toStatusDescriptor({ labelKey: "missing.key", tone: "success" }, fakeT)).toEqual({ tone: "neutral", label: "T(common.status.unknown)", icon: "help" });
    expect(toStatusDescriptor(null, fakeT).tone).toBe("neutral");
    // CodeRabbit #4: an invalid tone also drops an explicit (e.g. verified-looking) icon.
    expect(toStatusDescriptor({ labelKey: "payment.status.paid", tone: "gold", icon: "shield" }, fakeT)).toEqual({ tone: "neutral", label: "T(payment.status.paid)", icon: "help" });
    expect(toStatusDescriptor({ labelKey: "payment.status.paid", tone: "success", icon: "shield" }, fakeT).icon).toBe("shield");
  });

  it("KeyedStatusBadge renders the translated label, never the raw key", () => {
    render(withIntl(h(KeyedStatusBadge, { presentation: { labelKey: "payment.status.due", tone: "warning" } })));
    expect(screen.getByText("Payment due")).toBeTruthy();
    cleanup();
    render(withIntl(h(KeyedStatusBadge, { presentation: { labelKey: "booking.status.nope", tone: "success" } })));
    expect(screen.getByText("Unknown status")).toBeTruthy();
  });
});

describe("XREVIEW A2: Stepper is a group, not a nav landmark", () => {
  it("has no navigation landmark", () => {
    render(withIntl(h(Stepper, { steps: [{ id: "a", label: "Vitals", state: "current" }, { id: "b", label: "Review", state: "upcoming" }] })));
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getByRole("group", { name: "Progress" })).toBeTruthy();
  });
});

describe("XREVIEW A3: ErrorSummary ids are unique", () => {
  it("two summaries on one page get different, correct accessible names", () => {
    render(
      withIntl(
        h("div", null, h(ErrorSummary, { errors: [{ fieldId: "a", message: "A" }] }), h(ErrorSummary, { errors: [{ fieldId: "b", message: "B" }, { fieldId: "c", message: "C" }] })),
      ),
    );
    const alerts = screen.getAllByRole("alert");
    const ids = alerts.map((a) => a.getAttribute("aria-labelledby"));
    expect(new Set(ids).size).toBe(2);
    expect(alerts[1].querySelector(`[id="${ids[1]}"]`)?.textContent).toContain("Fix 2 problems");
  });
});

describe("XREVIEW A4/A8: phone input", () => {
  it("never truncates over-long numbers into a valid-looking one", () => {
    expect(normalizeIndianMobile("98765432109")).toBe("98765432109");
    expect(isValidIndianMobile(normalizeIndianMobile("98765432109"))).toBe(false);
    expect(isValidIndianMobile(normalizeIndianMobile("+1 415 555 0123 99"))).toBe(false);
    expect(normalizeIndianMobile("+91 98765 43210")).toBe("9876543210");
  });

  it("maps Arabic-Indic, extended Arabic-Indic and full-width digits", () => {
    expect(toAsciiDigits("٩٨٧")).toBe("987");
    expect(toAsciiDigits("۱۲۳")).toBe("123");
    expect(sanitizeOtp("１２３４５６")).toBe("123456");
  });

  it("announces the +91 prefix to assistive tech", () => {
    function Harness() {
      const [v, setV] = useState("");
      return h("div", null, h("label", { htmlFor: "m" }, "Mobile"), h(PhoneInput, { id: "m", value: v, onValueChange: setV, "aria-describedby": "hint" }), h("p", { id: "hint" }, "hint"));
    }
    render(withIntl(h(Harness)));
    const input = screen.getByLabelText("Mobile");
    const [prefixId, hintId] = (input.getAttribute("aria-describedby") ?? "").split(" ");
    expect(hintId).toBe("hint");
    expect(document.getElementById(prefixId)?.textContent).toContain("India country code +91");
    fireEvent.change(input, { target: { value: "987654321099" } });
    expect((input as HTMLInputElement).value).toBe("987654321099");
  });
});

describe("XREVIEW A5: GateNotice without a feature flag", () => {
  it("renders an honest contract-pending notice", () => {
    render(withIntl(h(GateNotice, { reason: "contract_pending" })));
    expect(screen.getByText("Not available yet")).toBeTruthy();
    expect(document.querySelector('[data-gate="contract_pending"]')).toBeTruthy();
  });

  it("still names the flag when one is given", () => {
    render(withIntl(h(GateNotice, { feature: "livePayments" })));
    expect(screen.getByText("Online payment is not available yet")).toBeTruthy();
  });
});

describe("money and documents", () => {
  it("formats integer paise as INR with Latin digits in every locale", () => {
    expect(formatPaise(123450, "en")).toBe("₹1,234.50");
    expect(formatPaise(50000, "hi")).toMatch(/500/);
    expect(formatPaise(50000, "te")).toMatch(/500/);
    expect(formatPaise(1234567800, "en")).toBe("₹1,23,45,678");
  });

  it("refuses non-integer, negative or non-number amounts", () => {
    for (const v of [12.5, -1, NaN, "100", null, Number.MAX_SAFE_INTEGER + 2]) {
      expect(isValidPaise(v)).toBe(false);
      expect(formatPaise(v, "en")).toBeNull();
    }
  });

  it("accepts only internal paths and credential-free https document URLs", () => {
    expect(isSafeDocumentHref("/en/patient/payments/1")).toBe(true);
    expect(isSafeDocumentHref("https://files.example.test/signed?x=1")).toBe(true);
    for (const bad of ["//evil.test", "http://x.test", "javascript:alert(1)", "https://u:p@x.test", "data:text/html,hi", ""]) {
      expect(isSafeDocumentHref(bad), bad).toBe(false);
    }
  });

  it("links a document only when available with a safe URL, without leaking the referrer", () => {
    render(withIntl(h("div", null, h(InvoiceLink, { doc: { state: "available", href: "https://files.example.test/i.pdf", issuer: "provider" } }), h(ReceiptLink, { doc: { state: "available", href: "javascript:x" } }))));
    const link = screen.getByRole("link", { name: /Open invoice/ });
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(screen.getByText("Issued by the provider")).toBeTruthy();
    expect(screen.getByText(/not available/)).toBeTruthy();
  });
});

describe("PaymentSummary", () => {
  const base = { statusPresentation: { labelKey: "payment.status.due", tone: "warning" }, amountDuePaise: 80000, collectedPaise: 0, refundedPaise: 0, synthetic: true } as const;

  it("explains pay-after and never shows an amount due as received", () => {
    render(withIntl(h(PaymentSummary, { view: { kind: "ready", data: { ...base, method: "pay_after" } } })));
    expect(screen.getByText("Payment due")).toBeTruthy();
    expect(screen.getByText("Recorded as collected by the provider").nextElementSibling?.textContent).toBe("₹0");
    expect(screen.getByText(/This is not an online payment/)).toBeTruthy();
    expect(screen.getByText("Synthetic data, not live")).toBeTruthy();
  });

  it("shows 'Amount unavailable' for an invalid amount and renders gated/error states", () => {
    render(withIntl(h(PaymentSummary, { view: { kind: "ready", data: { ...base, amountDuePaise: 12.5, method: null } } })));
    expect(screen.getByText("Amount unavailable")).toBeTruthy();
    cleanup();
    render(withIntl(h(PaymentSummary, { view: viewFromResult<PaymentSummaryView>({ ok: false, error: { code: "gated" } }, "livePayments") })));
    expect(screen.getByText("Online payment is not available yet")).toBeTruthy();
  });
});

describe("CancellationDialog", () => {
  it("is ready only with an approved policy, a reason and an acknowledgement", () => {
    const policy = { state: "approved", version: "v1", summary: "s", feePaise: 0, refundPaise: null } as const;
    expect(isCancellationReady(policy, "other", true)).toBe(true);
    expect(isCancellationReady(policy, null, true)).toBe(false);
    expect(isCancellationReady(policy, "other", false)).toBe(false);
    expect(isCancellationReady({ state: "unavailable" }, "other", true)).toBe(false);
    expect(isCancellationReady({ ...policy, feePaise: -5 }, "other", true)).toBe(false);
  });

  it("sends the policy version and closes only after the server confirms", async () => {
    const onConfirm = vi.fn().mockResolvedValueOnce({ ok: false, code: "conflict" }).mockResolvedValueOnce({ ok: true });
    render(withIntl(h(CancellationDialog, { policy: { state: "approved", version: "2026-11-v3", summary: "Free until 2 hours before.", feePaise: 0, refundPaise: 50000 }, onConfirm })));
    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    const confirm = () => screen.getAllByRole("button", { name: "Cancel booking" }).at(-1)!;
    expect(confirm().hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("No fee")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("My plans changed"));
    fireEvent.click(screen.getByLabelText(/I have read the cancellation terms/));
    await act(async () => fireEvent.click(confirm()));
    expect(onConfirm).toHaveBeenCalledWith({ reason: "schedule_change", policyVersion: "2026-11-v3" });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(errors.api.conflict)).toBeTruthy();
    await act(async () => fireEvent.click(confirm()));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("fails closed without approved terms", () => {
    render(withIntl(h(CancellationDialog, { policy: { state: "unavailable" }, onConfirm: vi.fn() })));
    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    expect(screen.getByText("Cancellation is not available here right now")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Cancel booking" }).at(-1)!.hasAttribute("disabled")).toBe(true);
  });
});

describe("support tickets", () => {
  it("validates category, booking and description bounds", () => {
    expect(validateTicket({ category: "", bookingId: "", description: "  " })).toEqual({ ok: false, errors: { category: "required", description: "required" } });
    expect(validateTicket({ category: "payment", bookingId: "x", description: "a".repeat(1001) }, ["b1"])).toEqual({
      ok: false,
      errors: { bookingId: "invalid", description: "tooLong" },
    });
    expect(validateTicket({ category: "service", bookingId: "b1", description: " Late " }, ["b1"])).toEqual({
      ok: true,
      input: { category: "service", bookingId: "b1", description: "Late" },
    });
  });

  it("warns on OTP-like codes and long identifiers but not on normal text", () => {
    expect(looksSensitive("my code is 482913")).toBe(true);
    expect(looksSensitive("aadhaar 1234 5678 9012")).toBe(true);
    expect(looksSensitive("The provider was late by an hour")).toBe(false);
  });

  it("submits once, shows the server reference and maps server errors", async () => {
    const onSubmit = vi.fn().mockResolvedValueOnce({ ok: false, error: { code: "rate_limited" } }).mockResolvedValueOnce({ ok: true, data: { reference: "#SCV-SUP-000042" } });
    render(withIntl(h(SupportTicketForm, { onSubmit })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send request" })));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Choose what the request is about" })).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Payment/));
    fireEvent.change(screen.getByLabelText(/Describe the problem/), { target: { value: "Refund not received" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send request" })));
    expect(screen.getByText(errors.api.rate_limited)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send request" })));
    expect(onSubmit).toHaveBeenLastCalledWith({ category: "payment", description: "Refund not received" });
    expect(screen.getByRole("status").textContent).toContain("#SCV-SUP-000042");
  });

  it("keeps an invalid preselected booking visible and lets the user remove it", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: { reference: null } });
    render(withIntl(h(SupportTicketForm, { defaultBookingId: "stale-id", bookings: [], onSubmit })));
    fireEvent.click(screen.getByLabelText(/Payment/));
    fireEvent.change(screen.getByLabelText(/Describe the problem/), { target: { value: "Receipt missing" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send request" })));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByText("Choose a booking from the list").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Remove the booking link" }));
    expect(screen.queryByRole("button", { name: "Remove the booking link" })).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send request" })));
    expect(onSubmit).toHaveBeenCalledWith({ category: "payment", description: "Receipt missing" });
  });

  it("renders the ticket timeline oldest first in IST, and an empty state", () => {
    render(
      withIntl(
        h(TicketTimeline, {
          view: {
            kind: "ready",
            data: [
              { id: "2", kind: "message", actor: "platform", at: "2026-11-18T10:00:00Z", message: "We are checking." },
              { id: "1", kind: "created", actor: "you", at: "2026-11-18T09:00:00Z" },
            ],
          },
        }),
      ),
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0].textContent).toContain("opened this request");
    expect(items[0].querySelector("time")?.textContent).toMatch(/2:30/);
    cleanup();
    render(withIntl(h(TicketTimeline, { view: { kind: "ready", data: [] } })));
    expect(screen.getByText("No updates yet")).toBeTruthy();
  });
});

describe("notifications", () => {
  const items = [
    { id: "a", kind: "booking_accepted", occurredAt: "2026-11-18T09:00:00Z", read: false, href: "/patient/bookings" },
    { id: "b", kind: "something_new", occurredAt: "2026-11-18T10:00:00Z", read: true, href: "https://evil.test" },
  ];

  it("applies optimistic read state and sorts newest first", () => {
    expect(applyReadState(items, { a: true }).map((n) => [n.id, n.read])).toEqual([["b", true], ["a", true]]);
    expect(isInternalPath("/x")).toBe(true);
    expect(isInternalPath("//x")).toBe(false);
  });

  it("marks read optimistically, rolls back on failure, and never links external URLs", async () => {
    const onMarkRead = vi.fn().mockResolvedValueOnce({ ok: false, code: "unavailable" }).mockResolvedValueOnce({ ok: true });
    render(withIntl(h(NotificationList, { view: { kind: "ready", data: items }, onMarkRead })));
    expect(screen.getByText("You have an update")).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("(1 unread)")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Mark as read" })));
    expect(screen.getByText(errors.api.unavailable)).toBeTruthy();
    expect(screen.getByText("(1 unread)")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Mark as read" })));
    expect(screen.getByText("(none unread)")).toBeTruthy();
  });

  it("shows an empty state", () => {
    render(withIntl(h(NotificationList, { view: { kind: "ready", data: [] } })));
    expect(screen.getByText("No notifications")).toBeTruthy();
  });
});

describe("rich text", () => {
  it("extracts plain text for search", () => {
    expect(
      richTextToPlain({
        type: "doc",
        blocks: [
          { type: "paragraph", children: [{ type: "text", text: "Hello " }, { type: "link", href: "/faq", children: [{ type: "text", text: "FAQ" }] }] },
          { type: "list", style: "bullet", items: [[{ type: "text", text: "one" }]] },
        ],
      }),
    ).toBe("Hello FAQ one");
  });
});

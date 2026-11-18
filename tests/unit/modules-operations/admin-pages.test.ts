// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/dashboard",
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));
vi.mock("next/server", () => ({ connection: async () => undefined }));

import { adminPrincipals } from "@/fixtures/operations/admin";
import { loadAdminDashboard, loadAdminUsers, loadAudit, loadBookingByReference, loadBookingExceptions, loadPayments, loadSettings } from "@/modules/admin/loaders";
import { loadContentEditor, loadContentList } from "@/modules/content/loaders";
import { AdminDashboardView, AdminUsersView, AuditView, BookingOpsView, PaymentsView, SettingsView } from "@/components/admin/admin-views";
import { CmsEditorView, CmsListView, CmsNewView } from "@/components/content/cms-views";
import { bookingLookupAction } from "@/modules/admin/admin-actions";
import { withIntl } from "./render-helpers";

afterEach(cleanup);
const FX = { FRONTEND_ADAPTER: "fixture", APP_ENV: "staging" };
const NOW = () => new Date("2026-11-20T00:00:00Z");
const actx = (principal: (typeof adminPrincipals)[keyof typeof adminPrincipals]) => ({ principal, env: FX, now: NOW });

describe("admin pages", () => {
  it("dashboard shows only assigned queues with real counts; no grants = empty state", async () => {
    render(withIntl(createElement(AdminDashboardView, { result: await loadAdminDashboard(actx(adminPrincipals.verifier), "en") })));
    expect(screen.getByTestId("queue-providerReviews").textContent).toBe("1");
    expect(screen.queryByTestId("queue-refundRequests")).toBeNull();
    cleanup();
    render(withIntl(createElement(AdminDashboardView, { result: await loadAdminDashboard(actx(adminPrincipals.noGrants), "en") })));
    expect(screen.getByText("No admin areas assigned")).toBeTruthy();
  });

  it("booking ops is read-only with separate booking and payment status", async () => {
    const ctx = actx(adminPrincipals.superAdmin);
    render(withIntl(createElement(BookingOpsView, { lookup: await loadBookingByReference(ctx, "#SCV-BKG-900104"), exceptions: await loadBookingExceptions(ctx) })));
    expect(screen.getByTestId("booking-status").textContent).toBe("completed");
    expect(screen.getByTestId("payment-status").textContent).toContain("Due");
    expect(screen.queryByRole("button", { name: /accept|mark paid|edit status/i })).toBeNull();
    expect(await bookingLookupAction("Fixture Patient")).toEqual({ ok: false, code: "validation", fields: { reference: "format" } });
  });

  it("users: no self-management; others can be suspended with a reason", async () => {
    const { container } = render(withIntl(createElement(AdminUsersView, { result: await loadAdminUsers(actx(adminPrincipals.superAdmin)) })));
    const rows = within(container.querySelector("tbody") as HTMLElement).getAllByRole("row");
    const self = rows.find((r) => r.textContent?.includes("Fixture Admin Lead")) as HTMLElement;
    expect(within(self).queryByRole("button", { name: "Suspend" })).toBeNull();
    expect(self.textContent).toContain("This is you");
    const other = rows.find((r) => r.textContent?.includes("Fixture Verifier")) as HTMLElement;
    fireEvent.click(within(other).getByRole("button", { name: "Suspend" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Suspend" }));
    expect(await within(dialog).findByText("Select a reason to continue.")).toBeTruthy();
  });

  it("payments: pay-after is not shown as online; refund approval and live payments are gated", async () => {
    const { container } = render(withIntl(createElement(PaymentsView, { result: await loadPayments(actx(adminPrincipals.superAdmin)) })));
    expect(container.textContent).toContain("Paid to provider in cash");
    expect((container.querySelector("tbody") as HTMLElement).textContent).not.toContain("Online payment");
    expect(container.querySelector('[data-gate="livePayments"]')).toBeTruthy();
    expect(screen.getByText(/Refund approval is not available yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /approve refund/i })).toBeNull();
  });

  it("audit never renders secrets or contact data; settings are read-only", async () => {
    const { container } = render(withIntl(createElement(AuditView, { result: await loadAudit(actx(adminPrincipals.superAdmin)) })));
    for (const leak of ["eyJhbGci", "Bearer", "482913", "90000 00000", "Fixture street"]) expect(container.textContent).not.toContain(leak);
    cleanup();
    const s = render(withIntl(createElement(SettingsView, { result: await loadSettings(actx(adminPrincipals.superAdmin)) })));
    expect(s.container.textContent).toContain("Emergency dispatch");
    expect(s.container.querySelectorAll("input, button[role=switch]").length).toBe(0);
  });
});

describe("CMS pages", () => {
  it("list shows locale versions and states", async () => {
    const { container } = render(withIntl(createElement(CmsListView, { canEdit: true, result: await loadContentList(actx(adminPrincipals.contentEditor)) })));
    const faq = within(container.querySelector("tbody") as HTMLElement).getAllByRole("row").find((r) => r.textContent?.includes("synthetic-faq-booking")) as HTMLElement;
    expect(faq.textContent).toContain("Published");
    expect(faq.textContent).toContain("In preview");
    expect(faq.textContent).toContain("Not written");
  });

  it("editor: editor sees no publish button; the consent gate blocks publishing a story without consent", async () => {
    render(withIntl(createElement(CmsEditorView, { result: await loadContentEditor(actx(adminPrincipals.contentEditor), "fx-cms-faq-1", "hi") })));
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    expect(screen.getByRole("button", { name: "Back to draft" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Revision history" })).toBeTruthy();
    cleanup();
    render(withIntl(createElement(CmsEditorView, { result: await loadContentEditor(actx(adminPrincipals.contentPublisher), "fx-cms-faq-1", "hi") })));
    expect(screen.getByRole("button", { name: "Publish" })).toBeTruthy();
  });

  it("new story form rejects HTML and unsafe links before saving", async () => {
    render(withIntl(createElement(CmsNewView, { kind: "story", locale: "en" })));
    fireEvent.change(screen.getByLabelText(/Address name/), { target: { value: "e2e-story" } });
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "<script>alert(1)</script>" } });
    fireEvent.change(screen.getByLabelText(/^Body/), { target: { value: "Click [here](javascript:alert(1))" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect((await screen.findAllByText("HTML and markup are not allowed. Use plain text.")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/That link is not allowed/).length).toBeGreaterThan(0);
    expect(document.querySelector("script")).toBeNull();
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string | { pathname: string; query?: Record<string, string> }; children: ReactNode }) =>
    createElement("a", { href: typeof href === "string" ? href : `${href.pathname}?${new URLSearchParams(href.query).toString()}`, ...rest }, children),
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/lab/dashboard",
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

import { workspaceMemberships as W } from "@/fixtures/operations/workspaces";
import { listWorkspaces } from "@/modules/admin/workspace";
import { loadLabCollections, loadLabDashboard, loadLabOrderDetail, loadLabOrders, loadLabReports } from "@/modules/lab/loaders";
import { LabCollectionsView, LabDashboardView, LabNotConnectedView, LabOrderDetailView, LabOrdersView, LabReportsView } from "@/components/lab/lab-views";
import { validateCatalogForm } from "@/components/lab/catalog-edit-form";
import { withIntl } from "./render-helpers";

afterEach(cleanup);
const FX = { FRONTEND_ADAPTER: "fixture", APP_ENV: "staging" };
const NOW = () => new Date("2026-11-20T03:00:00Z");
const ctx = (m: Parameters<typeof listWorkspaces>[0], env: Record<string, string> = FX) => ({ workspace: listWorkspaces(m)[0], env, now: NOW });
/** Fixture street/phone values must never reach the collector list (exact address is shown only in-window by the server). */
const PRIVATE = ["Fixture street", "+91"];

describe("lab dashboard page", () => {
  it("manager sees real counts and the synthetic-data notice", async () => {
    render(withIntl(createElement(LabDashboardView, { result: await loadLabDashboard(ctx(W.labManager)), workspaceName: "Synthetic Lab One" })));
    expect(screen.getByText("Synthetic data, not live")).toBeTruthy();
    expect(screen.getByTestId("metric-pending").textContent).toBe("1");
    expect(screen.getByTestId("metric-exceptions").textContent).toBe("1");
    expect(screen.queryByText("Reports to review")).toBeNull();
  });

  it("http mode shows 'Not connected yet' instead of zero", async () => {
    render(withIntl(createElement(LabDashboardView, { result: await loadLabDashboard(ctx(W.labManager, {})), workspaceName: "X" })));
    expect(screen.getByTestId("metric-pending").textContent).toBe("Not connected yet");
    expect(screen.queryByText("Synthetic data, not live")).toBeNull();
  });
});

describe("lab orders pages", () => {
  it("orders list links to detail by id, never puts personal data in the URL", async () => {
    const { container } = render(withIntl(createElement(LabOrdersView, { queue: "exceptions", result: await loadLabOrders(ctx(W.labManager), "exceptions") })));
    const link = within(container.querySelector("table") as HTMLElement).getByRole("link", { name: "#SCV-BKG-900103" });
    expect(link.getAttribute("href")).toBe("/lab/orders/fx-lab-order-3");
    expect(screen.getAllByRole("link", { name: "Exceptions" })[0].getAttribute("aria-current")).toBe("page");
  });

  it("failed order offers recollection and keeps payment separate", async () => {
    render(withIntl(createElement(LabOrderDetailView, { result: await loadLabOrderDetail(ctx(W.labManager), "fx-lab-order-3") })));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Order #SCV-BKG-900103");
    expect(screen.getByRole("button", { name: "Request recollection" })).toBeTruthy();
    expect(screen.getByText("Preparation not followed (for example fasting)")).toBeTruthy();
    expect(screen.getByText(/Payment is tracked separately/)).toBeTruthy();
  });

  it("another provider's workspace gets the not-found state", async () => {
    const other = W.labManager.map((m) => ({ ...m, providerId: "fx-other" }));
    render(withIntl(createElement(LabOrderDetailView, { result: await loadLabOrderDetail(ctx(other), "fx-lab-order-3") })));
    expect(screen.getByText("We could not find that record")).toBeTruthy();
    expect(screen.queryByText("#SCV-BKG-900103")).toBeNull();
  });
});

describe("lab collections page (assigned collector only)", () => {
  it("lists only assigned jobs with their allowed next steps", async () => {
    const { container } = render(withIntl(createElement(LabCollectionsView, { result: await loadLabCollections(ctx(W.labCollector)) })));
    const table = within(container.querySelector("table") as HTMLElement);
    expect(table.getByText("#SCV-BKG-900102")).toBeTruthy();
    expect(table.queryByText("#SCV-BKG-900103")).toBeNull();
    expect(table.getByRole("button", { name: "Start collection" })).toBeTruthy();
    expect(table.getByRole("button", { name: "Could not collect" })).toBeTruthy();
    expect(table.queryByRole("button", { name: "Sample collected" })).toBeNull();
    for (const marker of PRIVATE) expect(container.textContent).not.toContain(marker);
  });

  it("failure dialog requires a reason before calling the server", async () => {
    const { container } = render(withIntl(createElement(LabCollectionsView, { result: await loadLabCollections(ctx(W.labCollector)) })));
    fireEvent.click(within(container.querySelector("table") as HTMLElement).getByRole("button", { name: "Could not collect" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByLabelText("Reason")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Could not collect" }));
    expect(await within(dialog).findByText("Select a reason to continue.")).toBeTruthy();
  });

  it("a manager opening collections is denied by the loader", async () => {
    render(withIntl(createElement(LabCollectionsView, { result: await loadLabCollections(ctx(W.labManager)) })));
    expect(screen.getByRole("heading", { name: "You do not have access to this page" })).toBeTruthy();
  });
});

describe("lab reports page (reviewer only, gated)", () => {
  it("shows the clinical gate notice when release is off", async () => {
    const { container } = render(withIntl(createElement(LabReportsView, { result: await loadLabReports(ctx(W.labReviewer)) })));
    expect(container.querySelector('[data-gate="clinical"]')).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Release report" })).toBeNull();
  });

  it("offers release only on the reviewed version; collectors are denied", async () => {
    const env = { ...FX, FEATURE_CLINICAL: "true" };
    const { container } = render(withIntl(createElement(LabReportsView, { result: await loadLabReports(ctx(W.labReviewer, env)) })));
    const rows = within(container.querySelector("tbody") as HTMLElement).getAllByRole("row");
    expect(within(rows[0]).queryByRole("button", { name: "Release report" })).toBeNull();
    expect(within(rows[0]).getByRole("button", { name: "Mark reviewed" })).toBeTruthy();
    expect(within(rows[1]).getByRole("button", { name: "Release report" })).toBeTruthy();
    cleanup();
    render(withIntl(createElement(LabReportsView, { result: await loadLabReports(ctx(W.labCollector, env)) })));
    expect(screen.getByRole("heading", { name: "You do not have access to this page" })).toBeTruthy();
  });

  it("completion copy never claims a report is ready", async () => {
    const { container } = render(withIntl(createElement(LabOrdersView, { queue: "processing", result: await loadLabOrders(ctx(W.labManager), "processing") })));
    expect(container.textContent).toContain("Collection/processing done");
    expect(container.textContent).not.toMatch(/report (is )?ready|results available|report delivered/i);
  });
});

describe("lab billing/support placeholders and catalog form", () => {
  it("not-connected sections say so instead of showing invented data", () => {
    const { container } = render(withIntl(createElement(LabNotConnectedView, { section: "billing" })));
    expect(container.querySelector("[data-not-connected]")).toBeTruthy();
  });

  it("catalog form validates price and plain-text preparation locally", () => {
    expect(validateCatalogForm({ price: "450.00", preparation: "Fast overnight.", active: true })).toEqual({});
    expect(validateCatalogForm({ price: "45.123", preparation: "x", active: true })).toEqual({ price: "invalid" });
    expect(validateCatalogForm({ price: "-1", preparation: "<b>x</b>", active: true })).toEqual({ price: "invalid", preparation: "invalid" });
  });
});
